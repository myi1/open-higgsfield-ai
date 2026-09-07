import { describe, it, expect } from 'vitest';
import { buildDigest } from '../app/api/cron/daily-digest/route.js';

const gen = (email, studio, paidBy = 'COMPANY') => ({ email, studio, paidBy });

describe('buildDigest', () => {
  it('says plainly when nothing happened', () => {
    const { subject, text } = buildDigest([]);
    expect(subject).toMatch(/no generations/i);
    expect(text).toMatch(/nobody generated anything/i);
  });

  it('counts per person, heaviest first', () => {
    const { text } = buildDigest([
      gen('quiet@b.com', 'IMAGE'),
      gen('busy@b.com', 'IMAGE'),
      gen('busy@b.com', 'VIDEO'),
      gen('busy@b.com', 'VIDEO'),
    ]);

    expect(text.indexOf('busy@b.com')).toBeLessThan(text.indexOf('quiet@b.com'));
    expect(text).toMatch(/busy@b\.com.*3/);
  });

  it('calls out video separately, since that is where the money goes', () => {
    const { text } = buildDigest([gen('a@b.com', 'VIDEO'), gen('a@b.com', 'LIPSYNC')]);
    expect(text).toMatch(/2 video/i);
  });

  it('excludes people paying for themselves from the company total', () => {
    const { text } = buildDigest([
      gen('a@b.com', 'IMAGE', 'COMPANY'),
      gen('c@d.com', 'IMAGE', 'SELF'),
    ]);
    expect(text).toMatch(/1 on the company/i);
  });
});
