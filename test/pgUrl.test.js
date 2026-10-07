import { describe, it, expect } from 'vitest';
import { withExplicitSslMode } from '../lib/pgUrl.js';

const BASE = 'postgresql://user:pw@ep-x.eu-central-1.aws.neon.tech/neondb';

describe('withExplicitSslMode', () => {
  it.each(['require', 'prefer', 'verify-ca'])('turns sslmode=%s into verify-full', (mode) => {
    const out = new URL(withExplicitSslMode(`${BASE}?sslmode=${mode}&channel_binding=require`));
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.searchParams.get('channel_binding')).toBe('require');
    expect(out.username).toBe('user');
    expect(out.password).toBe('pw');
  });

  it('leaves verify-full, disable and a missing sslmode alone', () => {
    for (const url of [`${BASE}?sslmode=verify-full`, `${BASE}?sslmode=disable`, BASE]) {
      expect(withExplicitSslMode(url)).toBe(url);
    }
  });

  it('leaves a string that opts into libpq semantics alone', () => {
    const url = `${BASE}?uselibpqcompat=true&sslmode=require`;
    expect(withExplicitSslMode(url)).toBe(url);
  });

  it('passes through empty and unparseable values', () => {
    expect(withExplicitSslMode(undefined)).toBeUndefined();
    expect(withExplicitSslMode('not a url')).toBe('not a url');
  });
});
