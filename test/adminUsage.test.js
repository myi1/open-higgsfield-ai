import { describe, it, expect, vi, beforeEach } from 'vitest';

const currentUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser }));

const findMany = vi.fn();
const generationFindMany = vi.fn();
vi.mock('../lib/db.js', () => ({
  default: { appUser: { findMany }, generation: { findMany: generationFindMany } },
}));

beforeEach(() => {
  process.env.ADMIN_EMAIL = 'boss@example.com';
  currentUser.mockReset(); findMany.mockReset(); generationFindMany.mockReset();
});

const { GET } = await import('../app/api/admin/usage/route.js');

const req = (url = 'https://example.com/api/admin/usage?month=2026-09') => new Request(url);

describe('GET /api/admin/usage', () => {
  it('hides itself from a non-admin with a 404', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'nobody@example.com' } });
    expect((await GET(req())).status).toBe(404);
    expect(generationFindMany).not.toHaveBeenCalled();
  });

  it("counts each person's generations, split by studio kind and who paid", async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([
      { clerkUserId: 'u_1', email: 'a@b.com', keyMode: 'COMPANY', ownKeyLast4: null },
      { clerkUserId: 'u_2', email: 'c@d.com', keyMode: 'SELF', ownKeyLast4: '9876' },
    ]);
    generationFindMany.mockResolvedValue([
      { id: 'g1', clerkUserId: 'u_1', email: 'a@b.com', studio: 'IMAGE',  model: 'nano-banana', via: 'WEB', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g2', clerkUserId: 'u_1', email: 'a@b.com', studio: 'CINEMA', model: 'nano-banana', via: 'MCP', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g3', clerkUserId: 'u_1', email: 'a@b.com', studio: 'VIDEO',  model: 'kling-video', via: 'WEB', paidBy: 'COMPANY', createdAt: new Date() },
      { id: 'g4', clerkUserId: 'u_2', email: 'c@d.com', studio: 'LIPSYNC', model: 'ltx-lipsync', via: 'WEB', paidBy: 'SELF', createdAt: new Date() },
    ]);

    const body = await (await GET(req())).json();
    const first = body.people.find((p) => p.clerkUserId === 'u_1');
    const second = body.people.find((p) => p.clerkUserId === 'u_2');

    expect(first).toMatchObject({ total: 3, images: 2, videos: 1, paidByCompany: 3, paidBySelf: 0 });
    expect(second).toMatchObject({ total: 1, images: 0, videos: 1, paidBySelf: 1, paidByCompany: 0 });
  });

  it('includes a person with no generations at all', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([{ clerkUserId: 'u_9', email: 'quiet@b.com', keyMode: 'COMPANY', ownKeyLast4: null }]);
    generationFindMany.mockResolvedValue([]);

    const body = await (await GET(req())).json();
    expect(body.people[0]).toMatchObject({ email: 'quiet@b.com', total: 0 });
  });

  it('queries the month asked for, not always today', async () => {
    currentUser.mockResolvedValue({ primaryEmailAddress: { emailAddress: 'boss@example.com' } });
    findMany.mockResolvedValue([]); generationFindMany.mockResolvedValue([]);

    await GET(req('https://example.com/api/admin/usage?month=2026-03'));

    const where = generationFindMany.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
