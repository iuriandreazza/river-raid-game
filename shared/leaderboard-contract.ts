/** Wire format shared by the web client and the API. Keep it free of runtime dependencies. */

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/** The in-game score display has six digits, so nothing above this can be earned. */
export const MAX_SCORE = 999_999;

export interface LeaderboardEntry {
  rank: number;
  initials: string;
  score: number;
  /** ISO-8601 timestamp of when the score was recorded. */
  achievedAt: string;
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface SubmitScoreRequest {
  sessionId: string;
  initials: string;
  score: number;
}

export interface SubmitScoreResponse {
  entry: LeaderboardEntry;
}

export interface TopScoresResponse {
  entries: LeaderboardEntry[];
}

export type ApiErrorCode =
  | 'invalid_request'
  | 'unknown_session'
  | 'session_already_used'
  | 'implausible_score';

export interface ApiErrorResponse {
  error: { code: ApiErrorCode; message: string };
}
