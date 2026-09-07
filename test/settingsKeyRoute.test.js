import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth, currentUser: vi.fn() }));

const update = vi.fn();
vi.mock('../lib/db.js', () => ({ default: { appUser: { update } } }));

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
  auth.mockReset(); update.mockReset();
  update.mockResolvedValue({});
});

const { PUT, DELETE } = await import('../app/api/settings/key/route.js');

const put = (body) => new Request('https://example.com/api/settings/key', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('PUT /api/settings/key', () => {
  it('refuses an anonymous caller', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await PUT(put({ key: 'muapi_abc1234' }))).status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('stores the key encrypted, never in plain text', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    await PUT(put({ key: 'muapi_abc1234' }));

    const stored = update.mock.calls[0][0].data;
    expect(stored.ownKeyCiphertext).not.toContain('muapi_abc1234');
    expect(stored.ownKeyLast4).toBe('1234');
  });

  it('never returns the key it just stored', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    const res = await PUT(put({ key: 'muapi_abc1234' }));
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain('muapi_abc1234');
    expect(body).toEqual({ ok: true, last4: '1234' });
  });

  it('rejects an empty key', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    expect((await PUT(put({ key: '   ' }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/settings/key', () => {
  it('clears both the ciphertext and the last four', async () => {
    auth.mockResolvedValue({ userId: 'u_1' });
    await DELETE();

    expect(update.mock.calls[0][0].data)
      .toEqual({ ownKeyCiphertext: null, ownKeyLast4: null });
  });
});
