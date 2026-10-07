import { describe, it, expect, vi, beforeEach } from 'vitest';

const authenticateMcp = vi.fn();
const runTool = vi.fn();
vi.mock('@/lib/mcpTools', () => ({ authenticateMcp, runTool }));

const { handleMcpRequest } = await import('../lib/mcpServer.js');

const USER = { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' };
const URL_ = 'https://studio.test/mcp';

beforeEach(() => {
  authenticateMcp.mockReset();
  runTool.mockReset();
  authenticateMcp.mockResolvedValue(USER);
  runTool.mockResolvedValue({ content: [{ type: 'text', text: 'Submitted. Job id: req_1' }] });
});

// 2025-era client: initialize handshake, no per-request envelope.
const LEGACY_VERSION = '2025-06-18';
const legacyPost = (body) => new Request(URL_, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': LEGACY_VERSION,
  },
  body: JSON.stringify(body),
});

// 2026-07-28 client: every request carries its own envelope and headers.
const MODERN_VERSION = '2026-07-28';
const modernPost = (method, params = {}, id = 1, name) => new Request(URL_, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MODERN_VERSION,
    'mcp-method': method,
    ...(name && { 'mcp-name': name }),
  },
  body: JSON.stringify({
    jsonrpc: '2.0', id, method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN_VERSION,
        'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }),
});

const isJson = (res) => (res.headers.get('content-type') ?? '').includes('application/json');

describe('handleMcpRequest — nothing is held open', () => {
  it('answers GET (the standalone server-to-client stream) with 405, without a database lookup', async () => {
    const res = await handleMcpRequest(new Request(URL_, { method: 'GET' }), 'tok');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(authenticateMcp).not.toHaveBeenCalled();
  });

  it('answers DELETE with 405', async () => {
    const res = await handleMcpRequest(new Request(URL_, { method: 'DELETE' }), 'tok');
    expect(res.status).toBe(405);
  });

  it('rejects an unknown token with 401', async () => {
    authenticateMcp.mockResolvedValue(null);
    const res = await handleMcpRequest(legacyPost({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), 'bad');
    expect(res.status).toBe(401);
  });

  it('refuses subscriptions/listen at once with a JSON error instead of opening a stream', async () => {
    const res = await handleMcpRequest(
      modernPost('subscriptions/listen', { notifications: { toolsListChanged: true } }, 7),
      'tok',
    );
    expect(res.status).toBe(200);
    expect(isJson(res)).toBe(true);
    const body = await res.json();
    expect(body.id).toBe(7);
    expect(body.error.code).toBe(-32601);
  });
});

describe('handleMcpRequest — 2025-era clients get plain JSON', () => {
  it('initialize returns JSON and advertises no list-changed notifications', async () => {
    const res = await handleMcpRequest(legacyPost({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: LEGACY_VERSION, capabilities: {}, clientInfo: { name: 't', version: '1' } },
    }), 'tok');
    expect(res.status).toBe(200);
    expect(isJson(res)).toBe(true);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('open-higgsfield-ai');
    expect(body.result.capabilities.tools.listChanged).toBe(false);
  });

  it('tools/list returns every tool as JSON', async () => {
    const res = await handleMcpRequest(legacyPost({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), 'tok');
    expect(isJson(res)).toBe(true);
    const names = (await res.json()).result.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_models', 'generate_image', 'check_generation']));
  });

  it('tools/call runs the tool for the authenticated caller and returns JSON', async () => {
    const res = await handleMcpRequest(legacyPost({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'generate_image', arguments: { prompt: 'a cat', model: 'nano-banana' } },
    }), 'tok');
    expect(isJson(res)).toBe(true);
    const body = await res.json();
    expect(body.result.content[0].text).toContain('req_1');
    expect(runTool).toHaveBeenCalledWith(expect.objectContaining({ appUser: USER, tool: 'generate_image' }));
  });
});

describe('handleMcpRequest — 2026-07-28 clients get plain JSON', () => {
  it('tools/list returns JSON', async () => {
    const res = await handleMcpRequest(modernPost('tools/list'), 'tok');
    expect(res.status).toBe(200);
    expect(isJson(res)).toBe(true);
    const names = (await res.json()).result.tools.map((t) => t.name);
    expect(names).toContain('generate_video');
  });

  it('tools/call returns JSON for the authenticated caller', async () => {
    const res = await handleMcpRequest(
      modernPost('tools/call', { name: 'check_generation', arguments: { request_id: 'req_1' } }, 4, 'check_generation'),
      'tok',
    );
    expect(isJson(res)).toBe(true);
    const body = await res.json();
    expect(body.result.content[0].text).toContain('req_1');
    expect(runTool).toHaveBeenCalledWith(expect.objectContaining({ appUser: USER, tool: 'check_generation' }));
  });

  it('server/discover advertises no list-changed notifications', async () => {
    const res = await handleMcpRequest(modernPost('server/discover'), 'tok');
    const body = await res.json();
    expect(body.result.capabilities?.tools?.listChanged).not.toBe(true);
  });
});
