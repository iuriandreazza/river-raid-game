import { describe, expect, it } from 'vitest';
import { MAX_SCORE_PER_SECOND, SCORE_ALLOWANCE } from '../../shared/scoring-limits.ts';
import { SESSION_RETENTION_MS } from '../domain/play-session.ts';
import { createTestService } from '../testing/fakes.ts';
import { ImplausibleScoreError, SessionAlreadyUsedError, UnknownSessionError } from './errors.ts';

function setup() {
  const harness = createTestService();

  /** Starts a session and submits right away, so `score` must stay within the flat allowance. */
  function playAndSubmit(initials: string, score: number) {
    const session = harness.service.startSession();
    return harness.service.submitScore({ sessionId: session.id, initials, score });
  }

  return { ...harness, playAndSubmit };
}

describe('LeaderboardService', () => {
  describe('startSession', () => {
    it('issues sessions that start at the time given by the clock', () => {
      const { service, clock } = setup();
      const startedAt = clock.now();

      expect(service.startSession()).toEqual({ id: 'session-1', startedAt });
      clock.advance(5_000);
      expect(service.startSession()).toEqual({ id: 'session-2', startedAt: startedAt + 5_000 });
    });

    describe('pruning', () => {
      it('forgets unused sessions older than the retention window', () => {
        const { service, clock } = setup();
        const stale = service.startSession();

        clock.advance(SESSION_RETENTION_MS + 1);
        const fresh = service.startSession();

        expect(() => service.submitScore({ sessionId: stale.id, initials: 'AAA', score: 10 })).toThrow(
          UnknownSessionError,
        );
        expect(service.submitScore({ sessionId: fresh.id, initials: 'AAA', score: 10 }).rank).toBe(1);
      });

      it('keeps an unused session that is exactly as old as the retention window', () => {
        const { service, clock } = setup();
        const borderline = service.startSession();

        clock.advance(SESSION_RETENTION_MS);
        service.startSession();

        expect(service.submitScore({ sessionId: borderline.id, initials: 'AAA', score: 10 }).rank).toBe(1);
      });

      it('keeps old sessions that already received a score, so replays are still told apart from unknown ids', () => {
        const { service, clock } = setup();
        const used = service.startSession();
        service.submitScore({ sessionId: used.id, initials: 'AAA', score: 10 });

        clock.advance(SESSION_RETENTION_MS + 1);
        service.startSession();

        expect(() => service.submitScore({ sessionId: used.id, initials: 'BBB', score: 20 })).toThrow(
          SessionAlreadyUsedError,
        );
      });
    });
  });

  describe('submitScore', () => {
    it('stores the score with the time it was submitted and returns its rank', () => {
      const { service, clock } = setup();
      const session = service.startSession();
      clock.advance(20_000);

      const ranked = service.submitScore({ sessionId: session.id, initials: 'ABC', score: 5_000 });

      expect(ranked).toEqual({ rank: 1, initials: 'ABC', score: 5_000, achievedAt: clock.now() });
      expect(service.topScores(10)).toEqual([ranked]);
    });

    it('rejects an unknown session', () => {
      const { service } = setup();

      expect(() => service.submitScore({ sessionId: 'nope', initials: 'ABC', score: 10 })).toThrow(
        UnknownSessionError,
      );
      expect(service.topScores(10)).toEqual([]);
    });

    it('lets a session submit exactly once', () => {
      const { service, clock } = setup();
      const session = service.startSession();
      clock.advance(60_000);
      const first = service.submitScore({ sessionId: session.id, initials: 'AAA', score: 500 });

      expect(() => service.submitScore({ sessionId: session.id, initials: 'BBB', score: 900 })).toThrow(
        SessionAlreadyUsedError,
      );
      expect(() => service.submitScore({ sessionId: session.id, initials: 'AAA', score: 500 })).toThrow(
        SessionAlreadyUsedError,
      );
      expect(service.topScores(10)).toEqual([first]);
    });

    describe('plausibility', () => {
      it('accepts a score equal to what the elapsed time allows and rejects one point more', () => {
        const { service, clock } = setup();
        const elapsedSeconds = 10;
        const bound = SCORE_ALLOWANCE + MAX_SCORE_PER_SECOND * elapsedSeconds;
        const exact = service.startSession();
        const excessive = service.startSession();
        clock.advance(elapsedSeconds * 1000);

        expect(service.submitScore({ sessionId: exact.id, initials: 'AAA', score: bound }).score).toBe(bound);
        expect(() => service.submitScore({ sessionId: excessive.id, initials: 'AAA', score: bound + 1 })).toThrow(
          ImplausibleScoreError,
        );
      });

      it('measures the time from the start of the session, not from an earlier one', () => {
        const { service, clock } = setup();
        service.startSession();
        clock.advance(3_600_000);
        const recent = service.startSession();

        expect(() =>
          service.submitScore({ sessionId: recent.id, initials: 'AAA', score: SCORE_ALLOWANCE + 1 }),
        ).toThrow(ImplausibleScoreError);
      });

      it('does not burn the session, so a plausible score can still be submitted', () => {
        const { service, clock } = setup();
        const session = service.startSession();

        expect(() =>
          service.submitScore({ sessionId: session.id, initials: 'AAA', score: SCORE_ALLOWANCE + 1 }),
        ).toThrow(ImplausibleScoreError);
        expect(service.topScores(10)).toEqual([]);

        clock.advance(1_000);
        const accepted = service.submitScore({ sessionId: session.id, initials: 'AAA', score: SCORE_ALLOWANCE + 1 });
        expect(accepted.rank).toBe(1);
      });
    });

    describe('ranking', () => {
      it('ranks each new score against what is already stored', () => {
        const { playAndSubmit } = setup();

        expect(playAndSubmit('MID', 300).rank).toBe(1);
        expect(playAndSubmit('TOP', 500).rank).toBe(1);
        expect(playAndSubmit('LOW', 100).rank).toBe(3);
        expect(playAndSubmit('SEC', 400).rank).toBe(2);
      });

      it('puts the earlier achievement first when scores are equal', () => {
        const { playAndSubmit, clock, service } = setup();

        playAndSubmit('FST', 500);
        clock.advance(1_000);
        const later = playAndSubmit('SND', 500);

        expect(later.rank).toBe(2);
        expect(service.topScores(10).map((entry) => entry.initials)).toEqual(['FST', 'SND']);
      });

      it('falls back to insertion order when score and time are both equal', () => {
        const { playAndSubmit, service } = setup();

        const ranks = ['AAA', 'BBB', 'CCC'].map((initials) => playAndSubmit(initials, 500).rank);

        expect(ranks).toEqual([1, 2, 3]);
        expect(service.topScores(10).map((entry) => entry.initials)).toEqual(['AAA', 'BBB', 'CCC']);
      });
    });
  });

  describe('topScores', () => {
    it('lists ranked entries from the best score down, honouring the limit', () => {
      const { playAndSubmit, service } = setup();
      playAndSubmit('LOW', 100);
      playAndSubmit('TOP', 900);
      playAndSubmit('MID', 500);

      expect(service.topScores(10).map(({ rank, initials, score }) => ({ rank, initials, score }))).toEqual([
        { rank: 1, initials: 'TOP', score: 900 },
        { rank: 2, initials: 'MID', score: 500 },
        { rank: 3, initials: 'LOW', score: 100 },
      ]);
      expect(service.topScores(2).map((entry) => entry.initials)).toEqual(['TOP', 'MID']);
    });

    it('is empty before anyone has scored', () => {
      expect(setup().service.topScores(10)).toEqual([]);
    });
  });
});
