import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser }));

const getOrCreateAppUser = vi.fn();
vi.mock('../lib/appUser.js', () => ({ getOrCreateAppUser }));

const forwardToMuapi = vi.fn();
vi.mock('../lib/muapiForward.js', () => ({ forwardToMuapi }));

const { POST } = await import('../app/api/v1/[...path]/route.js');

function request(body, headers = {}) {
  return new Request('https://example.com/api/v1/nano-banana', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  auth.mockReset(); currentUser.mockReset();
  getOrCreateAppUser.mockReset(); forwardToMuapi.mockReset();
});

describe('POST /api/v1/[...path]', () => {
  it('refuses an anonymous request without calling MuAPI', async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(request({ prompt: 'x' }), { params: Promise.resolve({ path: ['nano-banana'] }) });

    expect(res.status).toBe(401);
    expect(forwardToMuapi).not.toHaveBeenCalled();
  });

  it('forwards a signed-in request with the caller and origin tag', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    currentUser.mockResolvedValue({
      id: 'u_1', primaryEmailAddress: { emailAddress: 'a@b.com' },
    });
    getOrCreateAppUser.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' });
    forwardToMuapi.mockResolvedValue({ status: 200, body: { request_id: 'req_1' } });

    const res = await POST(
      request({ prompt: 'a cat' }, { 'x-ohf-origin': 'web:cinema' }),
      { params: Promise.resolve({ path: ['nano-banana'] }) },
    );

    expect(res.status).toBe(200);
    expect(forwardToMuapi).toHaveBeenCalledWith(expect.objectContaining({
      path: 'nano-banana', via: 'WEB', origin: 'web:cinema',
      appUser: expect.objectContaining({ clerkUserId: 'u_1' }),
    }));
  });

  it('joins a multi-segment path back together for polling', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    currentUser.mockResolvedValue({ id: 'u_1', primaryEmailAddress: { emailAddress: 'a@b.com' } });
    getOrCreateAppUser.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY' });
    forwardToMuapi.mockResolvedValue({ status: 200, body: { status: 'completed' } });

    await POST(request({}), { params: Promise.resolve({ path: ['predictions', 'req_1', 'result'] }) });

    expect(forwardToMuapi.mock.calls[0][0].path).toBe('predictions/req_1/result');
  });
});
