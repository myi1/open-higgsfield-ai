import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => { process.env.ADMIN_EMAIL = 'Yahya@Example.com'; });
afterEach(() => { delete process.env.ADMIN_EMAIL; });

const { isAdminEmail } = await import('../lib/admin.js');

describe('isAdminEmail', () => {
  it('recognises the admin regardless of capitalisation', () => {
    expect(isAdminEmail('yahya@example.com')).toBe(true);
    expect(isAdminEmail('YAHYA@EXAMPLE.COM')).toBe(true);
  });

  it('rejects everyone else', () => {
    expect(isAdminEmail('someone@example.com')).toBe(false);
  });

  it('rejects an empty or missing email', () => {
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });

  it('lets nobody in when no admin is configured', () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminEmail('yahya@example.com')).toBe(false);
  });
});
