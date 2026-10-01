import { describe, expect, it } from 'vitest';
import { MAX_SCORE } from '../../shared/leaderboard-contract.ts';
import { MAX_SESSION_ID_LENGTH, parseScoreSubmission } from './score-submission.ts';

const validBody = { sessionId: 'session-1', initials: 'ABC', score: 1234 };

function rejectionMessage(input: unknown): string {
  const result = parseScoreSubmission(input);
  if (result.ok) {
    throw new Error(`Expected the input to be rejected: ${JSON.stringify(input)}`);
  }
  return result.message;
}

describe('parseScoreSubmission', () => {
  describe('accepts', () => {
    it('a well-formed submission', () => {
      expect(parseScoreSubmission(validBody)).toEqual({ ok: true, value: validBody });
    });

    it('unknown extra properties, which are dropped from the result', () => {
      const result = parseScoreSubmission({ ...validBody, admin: true });
      expect(result).toEqual({ ok: true, value: validBody });
    });

    it.each([
      ['the lowest score', { score: 1 }],
      ['the highest score', { score: MAX_SCORE }],
      ['a one character session id', { sessionId: 'x' }],
      ['the longest session id', { sessionId: 'x'.repeat(MAX_SESSION_ID_LENGTH) }],
      ['initials made of digits', { initials: '007' }],
      ['initials mixing letters and digits', { initials: 'A1Z' }],
    ])('%s', (_name, override) => {
      expect(parseScoreSubmission({ ...validBody, ...override }).ok).toBe(true);
    });
  });

  describe('rejects a body that is not a JSON object', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a string', 'ABC'],
      ['a number', 42],
      ['a boolean', true],
      ['an array', [validBody]],
    ])('%s', (_name, input) => {
      expect(rejectionMessage(input)).toContain('JSON object');
    });
  });

  describe('rejects an invalid sessionId', () => {
    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['too long', 'x'.repeat(MAX_SESSION_ID_LENGTH + 1)],
      ['a number', 123],
      ['null', null],
      ['an object', { id: 'session-1' }],
    ])('%s', (_name, sessionId) => {
      expect(rejectionMessage({ ...validBody, sessionId })).toContain('sessionId');
    });
  });

  describe('rejects invalid initials', () => {
    it.each([
      ['missing', undefined],
      ['lowercase, which is not silently fixed', 'abc'],
      ['mixed case', 'Abc'],
      ['too short', 'AB'],
      ['too long', 'ABCD'],
      ['empty', ''],
      ['containing a symbol', 'AB!'],
      ['containing a space', 'A B'],
      ['padded with whitespace', ' ABC'],
      ['containing a non-ASCII letter', 'ÄBC'],
      ['a number', 123],
      ['null', null],
      ['an array of letters', ['A', 'B', 'C']],
    ])('%s', (_name, initials) => {
      expect(rejectionMessage({ ...validBody, initials })).toContain('initials');
    });
  });

  describe('rejects an invalid score', () => {
    it.each([
      ['missing', undefined],
      ['zero', 0],
      ['negative zero', -0],
      ['negative', -5],
      ['fractional', 1.5],
      ['above the maximum', MAX_SCORE + 1],
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['a numeric string', '100'],
      ['null', null],
      ['a boolean', true],
      ['an array', [100]],
    ])('%s', (_name, score) => {
      expect(rejectionMessage({ ...validBody, score })).toContain('score');
    });
  });

  it('reports the first invalid field when several are wrong', () => {
    expect(rejectionMessage({ sessionId: '', initials: 'x', score: 0 })).toContain('sessionId');
    expect(rejectionMessage({ sessionId: 'ok', initials: 'x', score: 0 })).toContain('initials');
  });
});
