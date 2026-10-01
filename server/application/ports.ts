import type { PlaySession } from '../domain/play-session.ts';
import type { RankedScore, ScoreRecord } from '../domain/score.ts';

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

export interface IdGenerator {
  /** Returns a new identifier that cannot be guessed, since holding it is what lets a client submit a score. */
  next(): string;
}

export interface LeaderboardStore {
  saveSession(session: PlaySession): void;

  findSession(sessionId: string): PlaySession | undefined;

  /** Removes the sessions that started before `cutoff` (epoch milliseconds) and never received a score. */
  deleteUnusedSessionsStartedBefore(cutoff: number): void;

  /**
   * Stores the score and returns it with its rank: 1 + the number of stored scores that sort before it.
   * A session holds at most one score. The store itself must enforce that atomically and throw
   * SessionAlreadyUsedError for a second one, so two concurrent submissions can never both succeed.
   */
  addScore(record: ScoreRecord): RankedScore;

  /**
   * The best scores ranked 1..N, ordered by score descending, then earliest `achievedAt`, then insertion order.
   * `limit` must be a positive integer.
   */
  topScores(limit: number): RankedScore[];
}
