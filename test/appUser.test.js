import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock('../lib/db.js', () => ({
  default: { appUser: { findUnique, create, update } },
}));

const { getOrCreateAppUser, findAppUserByMcpToken } = await import('../lib/appUser.js');

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
});

describe('getOrCreateAppUser', () => {
  it('creates a person with a company key mode and an mcp token on first sight', async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve(data));

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });

    expect(user.clerkUserId).toBe('u_1');
    expect(user.keyMode).toBe('COMPANY');
    expect(user.mcpToken).toMatch(/^ohf_[A-Za-z0-9_-]{32,}$/);
  });

  it('gives two people different tokens', async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(({ data }) => Promise.resolve(data));

    const a = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });
    const b = await getOrCreateAppUser({ clerkUserId: 'u_2', email: 'b@b.com' });

    expect(a.mcpToken).not.toBe(b.mcpToken);
  });

  it('returns the existing person without creating a second record', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1', email: 'a@b.com', mcpToken: 'ohf_existing' });

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'a@b.com' });

    expect(user.mcpToken).toBe('ohf_existing');
    expect(create).not.toHaveBeenCalled();
  });

  it('updates a stale email on an existing person', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1', email: 'old@b.com', mcpToken: 'ohf_x' });
    update.mockImplementation(({ data }) => Promise.resolve({ clerkUserId: 'u_1', ...data }));

    const user = await getOrCreateAppUser({ clerkUserId: 'u_1', email: 'new@b.com' });

    expect(user.email).toBe('new@b.com');
  });
});

describe('findAppUserByMcpToken', () => {
  it('returns null for a blank token rather than querying', async () => {
    expect(await findAppUserByMcpToken('')).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks a person up by their token', async () => {
    findUnique.mockResolvedValue({ clerkUserId: 'u_1' });
    const user = await findAppUserByMcpToken('ohf_abc');
    expect(user.clerkUserId).toBe('u_1');
    expect(findUnique).toHaveBeenCalledWith({ where: { mcpToken: 'ohf_abc' } });
  });
});
