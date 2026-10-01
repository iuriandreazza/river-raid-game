import { INITIALS_LENGTH, isValidInitials } from '../../shared/initials.ts';
import { MAX_SCORE } from '../../shared/leaderboard-contract.ts';
import { invalid, valid, type Parsed } from './parsed.ts';

/** Generous for the UUIDs we issue, small enough that nobody can use the field to stuff data. */
export const MAX_SESSION_ID_LENGTH = 64;

export interface ScoreSubmission {
  readonly sessionId: string;
  readonly initials: string;
  readonly score: number;
}

export function parseScoreSubmission(input: unknown): Parsed<ScoreSubmission> {
  if (!isRecord(input)) {
    return invalid('Request body must be a JSON object.');
  }
  const { sessionId, initials, score } = input;
  if (!isValidSessionId(sessionId)) {
    return invalid(`sessionId must be a non-empty string of at most ${MAX_SESSION_ID_LENGTH} characters.`);
  }
  // Rejected rather than normalised: the client is expected to send them already sanitised.
  if (!isValidInitials(initials)) {
    return invalid(`initials must be exactly ${INITIALS_LENGTH} characters, each an uppercase letter A-Z or a digit 0-9.`);
  }
  if (!isValidScore(score)) {
    return invalid(`score must be an integer between 1 and ${MAX_SCORE}.`);
  }
  return valid({ sessionId, initials, score });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= MAX_SESSION_ID_LENGTH;
}

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SCORE;
}
