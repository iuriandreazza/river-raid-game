import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type {
  CreateSessionResponse,
  LeaderboardEntry,
  SubmitScoreResponse,
  TopScoresResponse,
} from '../../../shared/leaderboard-contract.ts';
import type { LeaderboardService } from '../../application/leaderboard-service.ts';
import { parsePageSize } from '../../domain/page-size.ts';
import type { RankedScore } from '../../domain/score.ts';
import { parseScoreSubmission } from '../../domain/score-submission.ts';
import { handleApiError, invalidRequest, jsonError } from './error-responses.ts';

const MAX_REQUEST_BODY_BYTES = 2 * 1024;

// Registered first and setting the header after next(), it also reaches the responses produced by the
// body limit, the error handler and the unknown-route fallback.
const neverCache: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};

function toLeaderboardEntry({ rank, initials, score, achievedAt }: RankedScore): LeaderboardEntry {
  return { rank, initials, score, achievedAt: new Date(achievedAt).toISOString() };
}

// Unparseable JSON is reported by the submission parser like any other body that is not an object.
async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

export function createApiRoutes(service: LeaderboardService): Hono {
  const api = new Hono();

  api.use('*', neverCache);
  api.use(
    '*',
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_BYTES,
      onError: (c) => jsonError(c, 413, 'payload_too_large', 'Request body is too large.'),
    }),
  );
  api.onError(handleApiError);

  api.get('/health', (c) => c.json({ status: 'ok' }));

  api.post('/sessions', (c) => {
    const body: CreateSessionResponse = { sessionId: service.startSession().id };
    return c.json(body, 201);
  });

  api.post('/scores', async (c) => {
    const submission = parseScoreSubmission(await readJsonBody(c));
    if (!submission.ok) {
      return invalidRequest(c, submission.message);
    }
    const body: SubmitScoreResponse = { entry: toLeaderboardEntry(service.submitScore(submission.value)) };
    return c.json(body, 201);
  });

  api.get('/scores', (c) => {
    const pageSize = parsePageSize(c.req.query('limit'));
    if (!pageSize.ok) {
      return invalidRequest(c, pageSize.message);
    }
    const body: TopScoresResponse = { entries: service.topScores(pageSize.value).map(toLeaderboardEntry) };
    return c.json(body);
  });

  // Registered last so unknown API routes never fall through to the single-page app.
  api.all('*', (c) => jsonError(c, 404, 'invalid_request', 'Unknown API route.'));

  return api;
}
