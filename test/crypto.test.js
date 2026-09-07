import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL = process.env.KEY_ENCRYPTION_SECRET;

beforeEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = 'test-secret-do-not-use-in-production';
});
afterEach(() => {
  process.env.KEY_ENCRYPTION_SECRET = ORIGINAL;
});

const { encryptSecret, decryptSecret, last4 } = await import('../lib/crypto.js');

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a key', () => {
    const key = 'muapi_live_abcdef123456';
    expect(decryptSecret(encryptSecret(key))).toBe(key);
  });

  it('never contains the plaintext', () => {
    const key = 'muapi_live_abcdef123456';
    expect(encryptSecret(key)).not.toContain(key);
  });

  it('produces a different ciphertext each time for the same input', () => {
    const key = 'muapi_live_abcdef123456';
    expect(encryptSecret(key)).not.toBe(encryptSecret(key));
  });

  it('refuses tampered ciphertext instead of returning garbage', () => {
    const packed = encryptSecret('muapi_live_abcdef123456');
    const [iv, tag, data] = packed.split('.');
    const flipped = data.slice(0, -2) + (data.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptSecret([iv, tag, flipped].join('.'))).toThrow();
  });

  it('refuses a malformed packed value', () => {
    expect(() => decryptSecret('nonsense')).toThrow(/malformed/i);
  });

  it('refuses to work without a secret configured', () => {
    delete process.env.KEY_ENCRYPTION_SECRET;
    expect(() => encryptSecret('x')).toThrow(/KEY_ENCRYPTION_SECRET/);
  });
});

describe('last4', () => {
  it('returns the final four characters', () => {
    expect(last4('muapi_live_abcdef123456')).toBe('3456');
  });

  it('handles a short value without throwing', () => {
    expect(last4('ab')).toBe('ab');
  });
});
