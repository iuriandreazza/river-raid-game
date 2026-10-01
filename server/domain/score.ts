import type { ScoreSubmission } from './score-submission.ts';

/** A validated submission stamped with the moment it was accepted (epoch milliseconds). */
export interface ScoreRecord extends ScoreSubmission {
  readonly achievedAt: number;
}

/**
 * A stored score with its 1-based position on the leaderboard.
 * Leaderboard order: score descending, then earliest `achievedAt`, then insertion order.
 */
export interface RankedScore {
  readonly rank: number;
  readonly initials: string;
  readonly score: number;
  /** Epoch milliseconds. */
  readonly achievedAt: number;
}
