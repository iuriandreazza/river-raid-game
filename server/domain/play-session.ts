import { maxPlausibleScore } from '../../shared/scoring-limits.ts';

/** A session nobody submitted a score for within a day is abandoned, so it can be forgotten. */
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

/** A stopwatch started when a run begins; it lets the API judge how much a submitted score could have earned. */
export interface PlaySession {
  readonly id: string;
  /** Epoch milliseconds. */
  readonly startedAt: number;
}

/** `now` is epoch milliseconds, like `startedAt`. */
export function isScorePlausible(session: PlaySession, score: number, now: number): boolean {
  const elapsedSeconds = (now - session.startedAt) / 1000;
  return score <= maxPlausibleScore(elapsedSeconds);
}
