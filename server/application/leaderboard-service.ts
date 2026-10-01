import { isScorePlausible, SESSION_RETENTION_MS, type PlaySession } from '../domain/play-session.ts';
import type { RankedScore } from '../domain/score.ts';
import type { ScoreSubmission } from '../domain/score-submission.ts';
import { ImplausibleScoreError, UnknownSessionError } from './errors.ts';
import type { Clock, IdGenerator, LeaderboardStore } from './ports.ts';

export interface LeaderboardServiceDependencies {
  readonly store: LeaderboardStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * The service trusts its input: callers must validate it first with parseScoreSubmission and parsePageSize.
 * An unchecked limit would reach the store, and SQLite reads a negative LIMIT as "no limit".
 */
export class LeaderboardService {
  readonly #store: LeaderboardStore;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;

  constructor({ store, clock, ids }: LeaderboardServiceDependencies) {
    this.#store = store;
    this.#clock = clock;
    this.#ids = ids;
  }

  startSession(): PlaySession {
    const session: PlaySession = { id: this.#ids.next(), startedAt: this.#clock.now() };
    // Pruning here keeps the table bounded without needing a background job.
    this.#store.deleteUnusedSessionsStartedBefore(session.startedAt - SESSION_RETENTION_MS);
    this.#store.saveSession(session);
    return session;
  }

  /**
   * Throws UnknownSessionError, ImplausibleScoreError or SessionAlreadyUsedError, in that order of precedence:
   * a replay that also carries an implausible score is reported as implausible.
   * Plausibility is checked before storing, so an implausible attempt does not burn the session.
   */
  submitScore(submission: ScoreSubmission): RankedScore {
    const session = this.#store.findSession(submission.sessionId);
    if (session === undefined) {
      throw new UnknownSessionError();
    }
    const now = this.#clock.now();
    if (!isScorePlausible(session, submission.score, now)) {
      throw new ImplausibleScoreError();
    }
    return this.#store.addScore({ ...submission, achievedAt: now });
  }

  topScores(limit: number): RankedScore[] {
    return this.#store.topScores(limit);
  }
}
