import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SCORE,
  type ApiErrorCode,
  type ApiErrorResponse,
  type CreateSessionResponse,
  type LeaderboardEntry,
  type SubmitScoreResponse,
  type TopScoresResponse,
} from '../../../shared/leaderboard-contract.ts';
import { SCORE_ALLOWANCE } from '../../../shared/scoring-limits.ts';
import { LeaderboardService } from '../../application/leaderboard-service.ts';
import type { LeaderboardStore } from '../../application/ports.ts';
import { createTestService, ManualClock, SequentialIdGenerator } from '../../testing/fakes.ts';
import { createApp } from './create-app.ts';

/** Mirrors the limit enforced by the API: bodies are tiny, so anything bigger is not a legitimate client. */
const MAX_BODY_BYTES = 2 * 1024;

const SECRET = 'secret that lives outside the static directory';

function setup(options: { staticDir?: string } = {}) {
  const { service, clock } = createTestService();
  return { app: createApp({ service, ...options }), clock };
}

async function sendRaw(app: Hono, method: string, path: string, body?: string, headers: Record<string, string> = {}) {
  return await app.request(path, { method, headers: { 'content-type': 'application/json', ...headers }, body });
}

async function send(app: Hono, method: string, path: string, body?: unknown) {
  return await sendRaw(app, method, path, body === undefined ? undefined : JSON.stringify(body));
}

async function startSession(app: Hono): Promise<string> {
  const response = await send(app, 'POST', '/api/sessions');
  return ((await response.json()) as CreateSessionResponse).sessionId;
}

async function submitScore(app: Hono, sessionId: string, initials: string, score: number) {
  return await send(app, 'POST', '/api/scores', { sessionId, initials, score });
}

/** Plays a whole run: starts a session and submits straight away, so `score` must fit the flat allowance. */
async function recordScore(app: Hono, initials: string, score: number): Promise<LeaderboardEntry> {
  const sessionId = await startSession(app);
  const response = await submitScore(app, sessionId, initials, score);
  expect(response.status).toBe(201);
  return ((await response.json()) as SubmitScoreResponse).entry;
}

async function listScores(app: Hono, query = ''): Promise<LeaderboardEntry[]> {
  const response = await send(app, 'GET', `/api/scores${query}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as TopScoresResponse).entries;
}

async function expectApiError(response: Response, status: number, code: ApiErrorCode): Promise<ApiErrorResponse> {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toContain('application/json');
  const body = (await response.json()) as ApiErrorResponse;
  expect(body.error.code).toBe(code);
  expect(body.error.message).not.toBe('');
  return body;
}

describe('GET /api/health', () => {
  it('reports that the service is up, uncached', async () => {
    const { app } = setup();

    const response = await send(app, 'GET', '/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /api/sessions', () => {
  it('creates a session and answers 201 with its id, uncached', async () => {
    const { app } = setup();

    const response = await send(app, 'POST', '/api/sessions');

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ sessionId: 'session-1' });
  });

  it('issues a different id every time', async () => {
    const { app } = setup();

    expect([await startSession(app), await startSession(app)]).toEqual(['session-1', 'session-2']);
  });
});

describe('POST /api/scores', () => {
  it('records the score and answers 201 with the ranked entry, uncached', async () => {
    const { app, clock } = setup();
    const sessionId = await startSession(app);
    clock.advance(10_000);

    const response = await submitScore(app, sessionId, 'ABC', 2_500);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      entry: { rank: 1, initials: 'ABC', score: 2_500, achievedAt: new Date(clock.now()).toISOString() },
    });
  });

  it('ranks the entry against the scores already on the board', async () => {
    const { app } = setup();
    await recordScore(app, 'AAA', 300);

    expect((await recordScore(app, 'BBB', 500)).rank).toBe(1);
    expect((await recordScore(app, 'CCC', 100)).rank).toBe(3);
  });

  it('ignores properties it does not know', async () => {
    const { app } = setup();
    const sessionId = await startSession(app);

    const response = await send(app, 'POST', '/api/scores', { sessionId, initials: 'ABC', score: 10, admin: true });

    expect(response.status).toBe(201);
  });

  describe('answers 400 invalid_request for', () => {
    const valid = { sessionId: 'session-1', initials: 'ABC', score: 100 };

    it.each<[string, string]>([
      ['malformed JSON', '{"sessionId": "session-1", '],
      ['an empty body', ''],
      ['plain text', 'ABC 100'],
      ['a JSON array', JSON.stringify([valid])],
      ['JSON null', 'null'],
      ['a JSON string', JSON.stringify('ABC')],
      ['a JSON number', '42'],
    ])('%s', async (_name, rawBody) => {
      const { app } = setup();
      await startSession(app);

      await expectApiError(await sendRaw(app, 'POST', '/api/scores', rawBody), 400, 'invalid_request');
    });

    it.each<[string, Record<string, unknown>]>([
      ['a missing sessionId', { ...valid, sessionId: undefined }],
      ['an empty sessionId', { ...valid, sessionId: '' }],
      ['a sessionId that is not a string', { ...valid, sessionId: 1 }],
      ['a sessionId that is far too long', { ...valid, sessionId: 'x'.repeat(500) }],
      ['missing initials', { ...valid, initials: undefined }],
      ['lowercase initials', { ...valid, initials: 'abc' }],
      ['initials that are too short', { ...valid, initials: 'AB' }],
      ['initials that are too long', { ...valid, initials: 'ABCD' }],
      ['initials with a symbol', { ...valid, initials: 'A-B' }],
      ['a missing score', { ...valid, score: undefined }],
      ['a zero score', { ...valid, score: 0 }],
      ['a negative score', { ...valid, score: -1 }],
      ['a fractional score', { ...valid, score: 1.5 }],
      ['a score above the maximum', { ...valid, score: MAX_SCORE + 1 }],
      ['a score sent as a string', { ...valid, score: '100' }],
    ])('%s', async (_name, body) => {
      const { app } = setup();
      await startSession(app);

      const response = await send(app, 'POST', '/api/scores', body);

      const error = await expectApiError(response, 400, 'invalid_request');
      expect(error.error.message).toMatch(/sessionId|initials|score/);
    });

    it('and leaves the session usable afterwards', async () => {
      const { app } = setup();
      const sessionId = await startSession(app);

      await sendRaw(app, 'POST', '/api/scores', 'not json');
      await submitScore(app, sessionId, 'abc', 100);

      expect((await submitScore(app, sessionId, 'ABC', 100)).status).toBe(201);
    });
  });

  it('answers 404 unknown_session for a session that was never issued', async () => {
    const { app } = setup();

    await expectApiError(await submitScore(app, 'never-issued', 'ABC', 100), 404, 'unknown_session');
    expect(await listScores(app)).toEqual([]);
  });

  it('answers 409 session_already_used when a session submits twice', async () => {
    const { app } = setup();
    const sessionId = await startSession(app);
    await submitScore(app, sessionId, 'AAA', 500);

    await expectApiError(await submitScore(app, sessionId, 'BBB', 900), 409, 'session_already_used');
    await expectApiError(await submitScore(app, sessionId, 'AAA', 500), 409, 'session_already_used');
    expect(await listScores(app)).toHaveLength(1);
  });

  it('answers 422 implausible_score when the score outruns the time played', async () => {
    const { app } = setup();
    const sessionId = await startSession(app);

    await expectApiError(await submitScore(app, sessionId, 'ABC', SCORE_ALLOWANCE + 1), 422, 'implausible_score');
    expect(await listScores(app)).toEqual([]);
  });

  it('does not burn the session on an implausible score, and accepts it once enough time has passed', async () => {
    const { app, clock } = setup();
    const sessionId = await startSession(app);
    await submitScore(app, sessionId, 'ABC', SCORE_ALLOWANCE + 1);

    clock.advance(1_000);
    const response = await submitScore(app, sessionId, 'ABC', SCORE_ALLOWANCE + 1);

    expect(response.status).toBe(201);
  });
});

describe('GET /api/scores', () => {
  it('answers 200 with an empty list before anyone has scored, uncached', async () => {
    const { app } = setup();

    const response = await send(app, 'GET', '/api/scores');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ entries: [] });
  });

  it('orders by score, then earliest achievement, then insertion order, with ranks 1..N', async () => {
    const { app, clock } = setup();
    await recordScore(app, 'AAA', 300);
    clock.advance(1_000);
    await recordScore(app, 'BBB', 500);
    await recordScore(app, 'CCC', 500);
    await recordScore(app, 'DDD', 300);
    clock.advance(1_000);
    await recordScore(app, 'EEE', 900);

    const entries = await listScores(app);

    expect(entries.map(({ rank, initials, score }) => ({ rank, initials, score }))).toEqual([
      { rank: 1, initials: 'EEE', score: 900 },
      { rank: 2, initials: 'BBB', score: 500 },
      { rank: 3, initials: 'CCC', score: 500 },
      { rank: 4, initials: 'AAA', score: 300 },
      { rank: 5, initials: 'DDD', score: 300 },
    ]);
  });

  it('formats achievedAt as an ISO-8601 timestamp', async () => {
    const { app, clock } = setup();
    await recordScore(app, 'AAA', 300);

    const [entry] = await listScores(app);

    expect(entry?.achievedAt).toBe(new Date(clock.now()).toISOString());
  });

  it('returns the default page size when no limit is given', async () => {
    const { app } = setup();
    for (let index = 0; index < DEFAULT_PAGE_SIZE + 2; index += 1) {
      await recordScore(app, 'AAA', 100 + index);
    }

    expect(await listScores(app)).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('honours the limit, up to the maximum page size', async () => {
    const { app } = setup();
    for (let index = 0; index < 5; index += 1) {
      await recordScore(app, 'AAA', 100 + index);
    }

    expect(await listScores(app, '?limit=3')).toHaveLength(3);
    expect(await listScores(app, '?limit=1')).toHaveLength(1);
    expect(await listScores(app, `?limit=${MAX_PAGE_SIZE}`)).toHaveLength(5);
  });

  it.each([
    ['zero', '0'],
    ['above the maximum', String(MAX_PAGE_SIZE + 1)],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['empty', ''],
    ['not a number', 'abc'],
    ['a number followed by text', '10abc'],
    ['hexadecimal', '0x10'],
    ['exponential', '1e1'],
  ])('answers 400 invalid_request for a limit that is %s', async (_name, limit) => {
    const { app } = setup();

    await expectApiError(await send(app, 'GET', `/api/scores?limit=${encodeURIComponent(limit)}`), 400, 'invalid_request');
  });
});

describe('request body limit', () => {
  const body = { sessionId: 'session-1', initials: 'ABC', score: 100 };

  function paddedBody(totalBytes: number): string {
    return JSON.stringify(body).padEnd(totalBytes, ' ');
  }

  it('accepts a body of exactly the limit', async () => {
    const { app } = setup();
    await startSession(app);

    const response = await sendRaw(app, 'POST', '/api/scores', paddedBody(MAX_BODY_BYTES));

    expect(response.status).toBe(201);
  });

  it('answers 413 for a body above the limit when the size is announced up front', async () => {
    const { app } = setup();
    const oversized = paddedBody(MAX_BODY_BYTES + 1);

    const response = await sendRaw(app, 'POST', '/api/scores', oversized, { 'content-length': String(oversized.length) });

    await expectApiError(response, 413, 'payload_too_large');
  });

  it('answers 413 for a body above the limit when the size is only known while reading', async () => {
    const { app } = setup();

    const response = await sendRaw(app, 'POST', '/api/scores', paddedBody(MAX_BODY_BYTES + 1));

    await expectApiError(response, 413, 'payload_too_large');
  });

  it('also protects the endpoint that does not read a body', async () => {
    const { app } = setup();

    const response = await sendRaw(app, 'POST', '/api/sessions', 'x'.repeat(MAX_BODY_BYTES + 1));

    await expectApiError(response, 413, 'payload_too_large');
  });
});

describe('unknown API routes', () => {
  let siteDir: string;

  beforeAll(() => {
    siteDir = mkdtempSync(join(tmpdir(), 'river-raid-site-'));
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>shell</title>');
  });

  afterAll(() => {
    rmSync(siteDir, { recursive: true, force: true });
  });

  describe.each([
    ['without static hosting', false],
    ['with static hosting, which must not swallow them', true],
  ])('%s', (_name, hosted) => {
    const appFor = () => setup(hosted ? { staticDir: siteDir } : {}).app;

    it.each([
      ['GET', '/api/nope'],
      ['GET', '/api'],
      ['GET', '/api/'],
      ['POST', '/api/nope'],
      ['GET', '/api/scores/'],
      ['GET', '/api/sessions'],
      ['DELETE', '/api/scores'],
      ['GET', '/api/health/deeper'],
    ])('answers %s %s with a JSON 404', async (method, path) => {
      await expectApiError(await send(appFor(), method, path), 404, 'invalid_request');
    });
  });
});

describe('unexpected failures', () => {
  const cause = 'disk exploded at /var/secret/leaderboard.sqlite';
  const fail = (): never => {
    throw new Error(cause);
  };
  const brokenStore: LeaderboardStore = {
    saveSession: fail,
    findSession: fail,
    deleteUnusedSessionsStartedBefore: fail,
    addScore: fail,
    topScores: fail,
  };
  const brokenApp = createApp({
    service: new LeaderboardService({
      store: brokenStore,
      clock: new ManualClock(),
      ids: new SequentialIdGenerator(),
    }),
  });
  let consoleError: MockInstance;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it.each([
    ['POST', '/api/sessions', undefined],
    ['POST', '/api/scores', { sessionId: 'session-1', initials: 'ABC', score: 100 }],
    ['GET', '/api/scores', undefined],
  ])('answers %s %s with a generic 500 and logs the cause', async (method, path, body) => {
    const response = await send(brokenApp, method, path, body);

    const error = await expectApiError(response, 500, 'internal_error');
    expect(error.error.message).toBe('Internal server error.');
    expect(JSON.stringify(error)).not.toContain('disk exploded');
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: cause }));
  });
});

describe('static hosting', () => {
  let workspace: string;
  let siteDir: string;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), 'river-raid-static-'));
    siteDir = join(workspace, 'site');
    mkdirSync(join(siteDir, 'assets'), { recursive: true });
    writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>River Raid shell</title>');
    writeFileSync(join(siteDir, 'assets', 'app.js'), 'console.log("river raid");');
    writeFileSync(join(workspace, 'secret.txt'), SECRET);
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each([
    ['an absolute path', () => siteDir],
    ['a path relative to the working directory', () => relative(process.cwd(), siteDir)],
  ])('serves the files of the directory given as %s', async (_name, staticDir) => {
    const { app } = setup({ staticDir: staticDir() });

    const response = await app.request('/assets/app.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(await response.text()).toBe('console.log("river raid");');
  });

  it('can host the working directory itself', async () => {
    const { app } = setup({ staticDir: process.cwd() });

    const response = await app.request('/package.json');

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toHaveProperty('name');
  });

  it.each(['/', '/index.html'])('serves the shell at %s', async (path) => {
    const { app } = setup({ staticDir: siteDir });

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('River Raid shell');
  });

  it.each(['/play', '/scores/weekly', '/apiary', '/api-docs'])(
    'falls back to the shell for the client-side route %s',
    async (path) => {
      const { app } = setup({ staticDir: siteDir });

      const response = await app.request(path);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('River Raid shell');
    },
  );

  it.each(['/assets/missing.js', '/missing.css', '/deep/missing.png'])(
    'answers 404, not the shell, for the missing file %s',
    async (path) => {
      const { app } = setup({ staticDir: siteDir });

      const response = await app.request(path);

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('River Raid shell');
    },
  );

  it('lets browsers keep the fingerprinted assets forever, but always revalidate the shell', async () => {
    const { app } = setup({ staticDir: siteDir });

    const asset = await app.request('/assets/app.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

    for (const path of ['/', '/index.html', '/play']) {
      const shell = await app.request(path);
      expect(shell.headers.get('cache-control'), path).toBe('no-cache');
    }
  });

  it('answers HEAD requests without a body', async () => {
    const { app } = setup({ staticDir: siteDir });

    const response = await app.request('/', { method: 'HEAD' });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('only serves files for GET and HEAD', async () => {
    const { app } = setup({ staticDir: siteDir });

    expect((await app.request('/', { method: 'POST' })).status).toBe(404);
    expect((await app.request('/assets/app.js', { method: 'DELETE' })).status).toBe(404);
  });

  it.each([
    '/secret.txt',
    '/../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/..%2fsecret.txt',
    '/assets/..%2f..%2fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
  ])('never serves files from outside the static directory (%s)', async (path) => {
    const { app } = setup({ staticDir: siteDir });

    const response = await app.request(path);

    expect(await response.text()).not.toContain(SECRET);
  });

  it('keeps the API working alongside the site', async () => {
    const { app } = setup({ staticDir: siteDir });

    expect(await (await app.request('/api/health')).json()).toEqual({ status: 'ok' });
    expect(await recordScore(app, 'ABC', 100)).toMatchObject({ rank: 1, initials: 'ABC' });
  });

  it('answers 404 for everything when no directory is given', async () => {
    const { app } = setup();

    expect((await app.request('/')).status).toBe(404);
    expect((await app.request('/assets/app.js')).status).toBe(404);
  });
});
