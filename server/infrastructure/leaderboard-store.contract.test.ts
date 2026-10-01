import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore } from '../application/ports.ts';
import type { ScoreRecord } from '../domain/score.ts';
import { InMemoryLeaderboardStore } from './in-memory-leaderboard-store.ts';
import { SqliteLeaderboardStore } from './sqlite-leaderboard-store.ts';

interface StoreUnderTest {
  readonly store: LeaderboardStore;
  dispose(): void;
}

function record(sessionId: string, initials: string, score: number, achievedAt: number): ScoreRecord {
  return { sessionId, initials, score, achievedAt };
}

/** The behaviour every LeaderboardStore adapter must show, whatever it persists to. */
function describeLeaderboardStoreContract(name: string, open: () => StoreUnderTest): void {
  describe(`${name} honours the LeaderboardStore contract`, () => {
    let subject: StoreUnderTest;

    beforeEach(() => {
      subject = open();
    });

    afterEach(() => {
      subject.dispose();
    });

    describe('sessions', () => {
      it('finds a saved session', () => {
        subject.store.saveSession({ id: 'session-1', startedAt: 1_700_000_000_123 });

        expect(subject.store.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1_700_000_000_123 });
      });

      it('does not find a session that was never saved', () => {
        subject.store.saveSession({ id: 'session-1', startedAt: 1 });

        expect(subject.store.findSession('session-2')).toBeUndefined();
      });
    });

    describe('addScore', () => {
      it('returns the stored score with rank 1 when the board is empty', () => {
        const ranked = subject.store.addScore(record('s1', 'ABC', 700, 1_700_000_000_123));

        expect(ranked).toEqual({ rank: 1, initials: 'ABC', score: 700, achievedAt: 1_700_000_000_123 });
      });

      it('ranks a score as 1 plus the number of stored scores that sort before it', () => {
        const ranks = [
          subject.store.addScore(record('s1', 'AAA', 100, 1_000)).rank,
          subject.store.addScore(record('s2', 'BBB', 300, 2_000)).rank,
          subject.store.addScore(record('s3', 'CCC', 200, 3_000)).rank,
          subject.store.addScore(record('s4', 'DDD', 50, 4_000)).rank,
        ];

        expect(ranks).toEqual([1, 1, 2, 4]);
      });

      it('ranks an equal score behind the one that was achieved earlier', () => {
        subject.store.addScore(record('s1', 'AAA', 500, 1_000));

        expect(subject.store.addScore(record('s2', 'BBB', 500, 2_000)).rank).toBe(2);
      });

      it('ranks an equal score ahead of one that was achieved later but stored earlier', () => {
        subject.store.addScore(record('s1', 'AAA', 500, 2_000));

        expect(subject.store.addScore(record('s2', 'BBB', 500, 1_000)).rank).toBe(1);
      });

      it('ranks by insertion order when score and time are both equal', () => {
        const ranks = ['s1', 's2', 's3'].map(
          (sessionId) => subject.store.addScore(record(sessionId, 'AAA', 500, 1_000)).rank,
        );

        expect(ranks).toEqual([1, 2, 3]);
      });

      it('rejects a second score for the same session and leaves the board untouched', () => {
        subject.store.addScore(record('s1', 'AAA', 500, 1_000));

        expect(() => subject.store.addScore(record('s1', 'BBB', 900, 2_000))).toThrow(SessionAlreadyUsedError);
        expect(() => subject.store.addScore(record('s1', 'AAA', 500, 1_000))).toThrow(SessionAlreadyUsedError);
        expect(subject.store.topScores(10)).toEqual([{ rank: 1, initials: 'AAA', score: 500, achievedAt: 1_000 }]);
      });
    });

    describe('topScores', () => {
      it('is empty when nothing was scored', () => {
        expect(subject.store.topScores(10)).toEqual([]);
      });

      it('orders by score descending, then earliest achievement, then insertion order, ranking 1..N', () => {
        subject.store.addScore(record('s1', 'LOW', 100, 1_000));
        subject.store.addScore(record('s2', 'LAT', 500, 3_000));
        subject.store.addScore(record('s3', 'TIE', 500, 2_000));
        subject.store.addScore(record('s4', 'TOP', 900, 4_000));
        subject.store.addScore(record('s5', 'ONE', 500, 2_000));
        subject.store.addScore(record('s6', 'EAR', 500, 1_500));

        expect(subject.store.topScores(10)).toEqual([
          { rank: 1, initials: 'TOP', score: 900, achievedAt: 4_000 },
          { rank: 2, initials: 'EAR', score: 500, achievedAt: 1_500 },
          { rank: 3, initials: 'TIE', score: 500, achievedAt: 2_000 },
          { rank: 4, initials: 'ONE', score: 500, achievedAt: 2_000 },
          { rank: 5, initials: 'LAT', score: 500, achievedAt: 3_000 },
          { rank: 6, initials: 'LOW', score: 100, achievedAt: 1_000 },
        ]);
      });

      it('returns no more than the limit, from the top', () => {
        subject.store.addScore(record('s1', 'AAA', 100, 1_000));
        subject.store.addScore(record('s2', 'BBB', 300, 2_000));
        subject.store.addScore(record('s3', 'CCC', 200, 3_000));

        expect(subject.store.topScores(2).map(({ rank, initials }) => ({ rank, initials }))).toEqual([
          { rank: 1, initials: 'BBB' },
          { rank: 2, initials: 'CCC' },
        ]);
        expect(subject.store.topScores(1)).toHaveLength(1);
      });

      it('returns everything when the limit exceeds the number of scores', () => {
        subject.store.addScore(record('s1', 'AAA', 100, 1_000));

        expect(subject.store.topScores(100)).toHaveLength(1);
      });

      it('reports the same rank in the list as it did when the score was added', () => {
        const added = [
          subject.store.addScore(record('s1', 'AAA', 100, 1_000)),
          subject.store.addScore(record('s2', 'BBB', 500, 1_000)),
        ];

        // Only the first entry slipped down, so only its rank may differ from what addScore reported.
        expect(subject.store.topScores(10)[0]).toEqual(added[1]);
        expect(subject.store.topScores(10)[1]).toEqual({ ...added[0], rank: 2 });
      });
    });

    describe('deleteUnusedSessionsStartedBefore', () => {
      it('removes unused sessions that started before the cutoff', () => {
        subject.store.saveSession({ id: 'old', startedAt: 999 });

        subject.store.deleteUnusedSessionsStartedBefore(1_000);

        expect(subject.store.findSession('old')).toBeUndefined();
      });

      it('keeps sessions that started at or after the cutoff', () => {
        subject.store.saveSession({ id: 'boundary', startedAt: 1_000 });
        subject.store.saveSession({ id: 'recent', startedAt: 1_001 });

        subject.store.deleteUnusedSessionsStartedBefore(1_000);

        expect(subject.store.findSession('boundary')).toBeDefined();
        expect(subject.store.findSession('recent')).toBeDefined();
      });

      it('keeps old sessions that received a score, so the score keeps its session', () => {
        subject.store.saveSession({ id: 'used', startedAt: 1 });
        subject.store.addScore(record('used', 'AAA', 10, 5));
        subject.store.saveSession({ id: 'unused', startedAt: 1 });

        subject.store.deleteUnusedSessionsStartedBefore(1_000);

        expect(subject.store.findSession('used')).toBeDefined();
        expect(subject.store.findSession('unused')).toBeUndefined();
        expect(() => subject.store.addScore(record('used', 'BBB', 20, 6))).toThrow(SessionAlreadyUsedError);
      });

      it('leaves the scores alone', () => {
        subject.store.saveSession({ id: 'used', startedAt: 1 });
        subject.store.addScore(record('used', 'AAA', 10, 5));

        subject.store.deleteUnusedSessionsStartedBefore(1_000);

        expect(subject.store.topScores(10)).toHaveLength(1);
      });

      it('does nothing on an empty store', () => {
        expect(() => subject.store.deleteUnusedSessionsStartedBefore(1_000)).not.toThrow();
      });
    });
  });
}

describeLeaderboardStoreContract('InMemoryLeaderboardStore', () => ({
  store: new InMemoryLeaderboardStore(),
  dispose: () => undefined,
}));

describeLeaderboardStoreContract('SqliteLeaderboardStore on :memory:', () => {
  const store = new SqliteLeaderboardStore(':memory:');
  return { store, dispose: () => store.close() };
});
