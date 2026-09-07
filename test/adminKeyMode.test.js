import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser }));

const update = vi.fn();
const findUnique = vi.fn();
vi.mock('../lib/db.js', () => ({ default: { appUser: { update, findUnique } } }));

beforeEach(() => {
  process.env.ADMIN_EMAIL = 'boss@example.com';
  currentUser.mockReset(); update.mockReset(); findUnique.mockReset();
  update.mockResolvedValue({});
});

const { POST } = await import('../app/api/admin/key-mode/route.js');

const req = (body) => new Request('https://example.com/api/admin/key-mode', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('POST /api/admin/key-mode', () => {
  it('hides itself from a non-admin with a 404, not a 403', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'someone@example.com' } });
    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }));

    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });

  it('lets the admin switch someone to their own key', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findUnique.mockResolvedValue({ clerkUserId: 'u_2', ownKeyCiphertext: 'ciphertext' });

    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }));

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { clerkUserId: 'u_2' }, data: { keyMode: 'SELF' } });
  });

  it('warns when switching someone who has no key saved', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findUnique.mockResolvedValue({ clerkUserId: 'u_2', ownKeyCiphertext: null });

    const body = await (await POST(req({ clerkUserId: 'u_2', keyMode: 'SELF' }))).json();

    expect(body.warning).toMatch(/no key saved/i);
  });

  it('rejects a key mode that is not COMPANY or SELF', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    const res = await POST(req({ clerkUserId: 'u_2', keyMode: 'FREE_MONEY' }));

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
