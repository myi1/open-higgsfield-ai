import { describe, it, expect, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
  process.env.MUAPI_API_KEY = 'company-key-123';
});
afterEach(() => {
  delete process.env.MUAPI_API_KEY;
});

const { encryptSecret } = await import('../lib/crypto.js');
const { resolveKeyForUser, MissingOwnKeyError, MissingCompanyKeyError } =
  await import('../lib/muapiKey.js');

describe('resolveKeyForUser', () => {
  it('gives a COMPANY person the company key', () => {
    const out = resolveKeyForUser({ keyMode: 'COMPANY' });
    expect(out).toEqual({ key: 'company-key-123', paidBy: 'COMPANY' });
  });

  it('gives a SELF person their own key', () => {
    const out = resolveKeyForUser({
      keyMode: 'SELF',
      ownKeyCiphertext: encryptSecret('their-own-key-999'),
    });
    expect(out).toEqual({ key: 'their-own-key-999', paidBy: 'SELF' });
  });

  it('refuses a SELF person with no key saved — and does NOT fall back to the company key', () => {
    expect(() => resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: null }))
      .toThrow(MissingOwnKeyError);

    try {
      resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: null });
    } catch (err) {
      expect(err.userMessage).toMatch(/add your.*key/i);
      expect(JSON.stringify(err)).not.toContain('company-key-123');
    }
  });

  it('refuses a SELF person whose saved key cannot be decrypted', () => {
    expect(() => resolveKeyForUser({ keyMode: 'SELF', ownKeyCiphertext: 'garbage' }))
      .toThrow(MissingOwnKeyError);
  });

  it('refuses when the company key is not configured', () => {
    delete process.env.MUAPI_API_KEY;
    expect(() => resolveKeyForUser({ keyMode: 'COMPANY' })).toThrow(MissingCompanyKeyError);
  });

  it('treats an unknown key mode as COMPANY rather than failing open with no key', () => {
    const out = resolveKeyForUser({ keyMode: undefined });
    expect(out.paidBy).toBe('COMPANY');
  });
});
