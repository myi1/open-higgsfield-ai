import { describe, it, expect } from 'vitest';
import { resolveStudio, isPollPath } from '../lib/studios.js';

describe('resolveStudio', () => {
  it('trusts the origin tag the caller declares', () => {
    expect(resolveStudio({ origin: 'web:cinema', endpoint: 'nano-banana' })).toBe('CINEMA');
    expect(resolveStudio({ origin: 'web:image', endpoint: 'nano-banana' })).toBe('IMAGE');
    expect(resolveStudio({ origin: 'mcp:video', endpoint: 'kling-video' })).toBe('VIDEO');
  });

  it('falls back to the model lists when no origin is declared', () => {
    expect(resolveStudio({ endpoint: 'nano-banana' })).toBe('IMAGE');
  });

  it('classifies an unknown endpoint as IMAGE rather than dropping it', () => {
    expect(resolveStudio({ endpoint: 'something-brand-new' })).toBe('IMAGE');
  });

  it('ignores a nonsense origin tag and falls back', () => {
    expect(resolveStudio({ origin: 'garbage', endpoint: 'nano-banana' })).toBe('IMAGE');
  });
});

describe('isPollPath', () => {
  it('recognises a result poll', () => {
    expect(isPollPath('predictions/abc-123/result')).toBe(true);
  });

  it('does not mistake a generation submit for a poll', () => {
    expect(isPollPath('nano-banana')).toBe(false);
    expect(isPollPath('flux-schnell-image')).toBe(false);
  });
});
