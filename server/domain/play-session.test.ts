import { describe, expect, it } from 'vitest';
import { MAX_SCORE } from '../../shared/leaderboard-contract.ts';
import { MAX_SCORE_PER_SECOND, SCORE_ALLOWANCE } from '../../shared/scoring-limits.ts';
import { isScorePlausible, SESSION_RETENTION_MS, type PlaySession } from './play-session.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const session: PlaySession = { id: 'session-1', startedAt: 1_700_000_000_000 };

function boundAfter(milliseconds: number): number {
  return SCORE_ALLOWANCE + (MAX_SCORE_PER_SECOND * milliseconds) / 1000;
}

describe('isScorePlausible', () => {
  it('only allows the flat allowance at the moment the session starts', () => {
    expect(isScorePlausible(session, SCORE_ALLOWANCE, session.startedAt)).toBe(true);
    expect(isScorePlausible(session, SCORE_ALLOWANCE + 1, session.startedAt)).toBe(false);
  });

  it('accepts a score equal to the bound and rejects one point above it', () => {
    const elapsed = 10_000;
    const bound = boundAfter(elapsed);
    expect(isScorePlausible(session, bound, session.startedAt + elapsed)).toBe(true);
    expect(isScorePlausible(session, bound + 1, session.startedAt + elapsed)).toBe(false);
  });

  it('accounts for fractions of a second', () => {
    const elapsed = 1_500;
    const bound = boundAfter(elapsed);
    expect(Number.isInteger(bound)).toBe(true);
    expect(isScorePlausible(session, bound, session.startedAt + elapsed)).toBe(true);
    expect(isScorePlausible(session, bound + 1, session.startedAt + elapsed)).toBe(false);
  });

  it('only grants the allowance when the clock reads earlier than the start', () => {
    const now = session.startedAt - 60_000;
    expect(isScorePlausible(session, SCORE_ALLOWANCE, now)).toBe(true);
    expect(isScorePlausible(session, SCORE_ALLOWANCE + 1, now)).toBe(false);
  });

  it('accepts every legal score once the session is old enough', () => {
    expect(isScorePlausible(session, MAX_SCORE, session.startedAt + ONE_DAY_MS)).toBe(true);
  });
});

describe('SESSION_RETENTION_MS', () => {
  it('is 24 hours', () => {
    expect(SESSION_RETENTION_MS).toBe(ONE_DAY_MS);
  });
});
