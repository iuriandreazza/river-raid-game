import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorResponse } from '../../../shared/leaderboard-contract.ts';
import { ImplausibleScoreError, SessionAlreadyUsedError, UnknownSessionError } from '../../application/errors.ts';

export function jsonError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return c.json(body, status);
}

export function invalidRequest(c: Context, message: string): Response {
  return jsonError(c, 400, 'invalid_request', message);
}

/** Translates the failures the use cases signal into API errors; anything else is a server fault. */
export function handleApiError(error: Error, c: Context): Response {
  if (error instanceof UnknownSessionError) {
    return jsonError(c, 404, 'unknown_session', error.message);
  }
  if (error instanceof SessionAlreadyUsedError) {
    return jsonError(c, 409, 'session_already_used', error.message);
  }
  if (error instanceof ImplausibleScoreError) {
    return jsonError(c, 422, 'implausible_score', error.message);
  }
  // The cause may mention paths or SQL, so it goes to the log and never to the client.
  console.error('Unexpected error while handling an API request:', error);
  return jsonError(c, 500, 'internal_error', 'Internal server error.');
}
