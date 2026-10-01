// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSound } from './compositionRoot.ts';
import { silentSound } from './infrastructure/audio/silentSound.ts';

describe('createSound', () => {
  it('falls back to silence in a browser that cannot make sound', () => {
    expect('AudioContext' in globalThis).toBe(false);
    expect(createSound()).toBe(silentSound);
  });
});
