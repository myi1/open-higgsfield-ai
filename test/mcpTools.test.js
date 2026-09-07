import { describe, it, expect, vi, beforeEach } from 'vitest';

const findAppUserByMcpToken = vi.fn();
vi.mock('../lib/appUser.js', () => ({ findAppUserByMcpToken }));

const forwardToMuapi = vi.fn();
vi.mock('../lib/muapiForward.js', () => ({ forwardToMuapi }));

beforeEach(() => { findAppUserByMcpToken.mockReset(); forwardToMuapi.mockReset(); });

const { authenticateMcp, runTool } = await import('../lib/mcpTools.js');

const USER = { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' };
const withAuth = (header) =>
  new Request('https://example.com/mcp', { headers: header ? { authorization: header } : {} });

describe('authenticateMcp', () => {
  it('accepts a token carried in the url path, for clients that cannot set headers', async () => {
    findAppUserByMcpToken.mockResolvedValue(USER);
    const req = new Request('https://example.com/mcp/ohf_from_path');
    const user = await authenticateMcp(req, 'ohf_from_path');
    expect(user.clerkUserId).toBe('u_1');
    expect(findAppUserByMcpToken).toHaveBeenCalledWith('ohf_from_path');
  });

  it('prefers the header when both a header and a path token are present', async () => {
    findAppUserByMcpToken.mockResolvedValue(USER);
    await authenticateMcp(withAuth('Bearer ohf_from_header'), 'ohf_from_path');
    expect(findAppUserByMcpToken).toHaveBeenCalledWith('ohf_from_header');
  });

  it('rejects an empty path token rather than querying', async () => {
    expect(await authenticateMcp(withAuth(), '')).toBeNull();
    expect(findAppUserByMcpToken).not.toHaveBeenCalled();
  });

  it('rejects a request with no token', async () => {
    expect(await authenticateMcp(withAuth())).toBeNull();
    expect(findAppUserByMcpToken).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', async () => {
    findAppUserByMcpToken.mockResolvedValue(null);
    expect(await authenticateMcp(withAuth('Bearer ohf_nope'))).toBeNull();
  });

  it('resolves a valid token to its person', async () => {
    findAppUserByMcpToken.mockResolvedValue(USER);
    const user = await authenticateMcp(withAuth('Bearer ohf_good'));
    expect(user.clerkUserId).toBe('u_1');
    expect(findAppUserByMcpToken).toHaveBeenCalledWith('ohf_good');
  });
});

describe('runTool', () => {
  it('generate_image submits and returns a job id without waiting', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_1' } });

    const out = await runTool({
      appUser: USER, tool: 'generate_image',
      args: { prompt: 'a cat', model: 'nano-banana' },
    });

    expect(forwardToMuapi).toHaveBeenCalledWith(expect.objectContaining({
      path: 'nano-banana', via: 'MCP', origin: 'mcp:image',
    }));
    expect(out.content[0].text).toContain('req_1');
  });

  it('generate_video is tagged as coming from the video studio', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_2' } });

    await runTool({ appUser: USER, tool: 'generate_video', args: { prompt: 'a car', model: 'kling-video' } });

    expect(forwardToMuapi.mock.calls[0][0].origin).toBe('mcp:video');
  });

  it('check_generation reports "still working" rather than failing', async () => {
    forwardToMuapi.mockResolvedValue({ status: 200, body: { status: 'processing' } });

    const out = await runTool({ appUser: USER, tool: 'check_generation', args: { request_id: 'req_1' } });

    expect(out.content[0].text).toMatch(/still working/i);
  });

  it('check_generation returns the result url when it is done', async () => {
    forwardToMuapi.mockResolvedValue({
      status: 200, body: { status: 'completed', outputs: [{ url: 'https://cdn/x.png' }] },
    });

    const out = await runTool({ appUser: USER, tool: 'check_generation', args: { request_id: 'req_1' } });

    expect(out.content[0].text).toContain('https://cdn/x.png');
  });

  it('passes a refusal through in plain language', async () => {
    forwardToMuapi.mockResolvedValue({
      status: 400, body: { error: 'You are set up to use your own MuAPI key, but none is saved.' },
    });

    const out = await runTool({ appUser: USER, tool: 'generate_image', args: { prompt: 'x', model: 'nano-banana' } });

    expect(out.content[0].text).toMatch(/own MuAPI key/);
  });

  it('list_models names models for each studio without calling MuAPI', async () => {
    const out = await runTool({ appUser: USER, tool: 'list_models', args: {} });

    expect(forwardToMuapi).not.toHaveBeenCalled();
    expect(out.content[0].text).toMatch(/image/i);
    expect(out.content[0].text).toMatch(/video/i);
  });
});
