import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { relative, resolve } from 'node:path';
import type { LeaderboardService } from '../../application/leaderboard-service.ts';
import { createApiRoutes } from './api-routes.ts';

export interface AppOptions {
  service: LeaderboardService;
  /** Directory with the built web client. When set, its files are served and `index.html` backs every other GET. */
  staticDir?: string;
}

/** Vite fingerprints everything under /assets, so those files never change under the same URL. */
const FINGERPRINTED_PREFIX = '/assets/';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** The built client runs its own script and style files and only talks to this server. */
const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'none'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'"],
  connectSrc: ["'self'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};

export function createApp({ service, staticDir }: AppOptions): Hono {
  const app = new Hono();
  app.use('*', secureHeaders({ contentSecurityPolicy: CONTENT_SECURITY_POLICY }));
  app.route('/api', createApiRoutes(service));
  if (staticDir !== undefined) {
    serveSinglePageApp(app, staticDir);
  }
  return app;
}

// Set after the response exists: serveStatic offers an onFound hook, but headers added there never reach the response.
const setCacheHeader: MiddlewareHandler = async (c, next) => {
  await next();
  if (!c.res.ok) return;
  const cacheControl = c.req.path.startsWith(FINGERPRINTED_PREFIX)
    ? `public, max-age=${ONE_YEAR_SECONDS}, immutable`
    : 'no-cache';
  c.header('Cache-Control', cacheControl);
};

function hasFileExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(path);
}

// Mounted after the API so that it never sees /api requests, which the API answers itself.
function serveSinglePageApp(app: Hono, staticDir: string): void {
  // serveStatic resolves `root` against the working directory, so an arbitrary path is made relative to it.
  const root = relative(process.cwd(), resolve(staticDir)) || '.';
  app.get('*', setCacheHeader);
  app.get('*', serveStatic({ root }));
  // A missing file must stay a 404: answering a lost script with the page would only fail later and more obscurely.
  app.get('*', (c, next) => (hasFileExtension(c.req.path) ? c.notFound() : next()));
  app.get('*', serveStatic({ root, path: 'index.html' }));
}
