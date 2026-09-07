import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth }));

const handleUpload = vi.fn();
vi.mock('@vercel/blob/client', () => ({ handleUpload }));

beforeEach(() => { auth.mockReset(); handleUpload.mockReset(); });

const { POST } = await import('../app/api/upload-token/route.js');

const req = () => new Request('https://example.com/api/upload-token', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});

describe('POST /api/upload-token', () => {
  it('refuses an anonymous caller — no free file hosting', async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(req());

    expect(res.status).toBe(401);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it('issues a token for a signed-in caller', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    handleUpload.mockResolvedValue({ type: 'blob.generate-client-token', clientToken: 'tok' });

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(handleUpload).toHaveBeenCalled();
  });

  it('reports a rejected upload without crashing', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    handleUpload.mockRejectedValue(new Error('content type not allowed'));

    const res = await POST(req());

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/content type/);
  });
});
