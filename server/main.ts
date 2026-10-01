import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { LeaderboardService } from './application/leaderboard-service.ts';
import { loadConfig } from './infrastructure/config.ts';
import { createApp } from './infrastructure/http/create-app.ts';
import { SqliteLeaderboardStore } from './infrastructure/sqlite-leaderboard-store.ts';

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

const config = loadConfig(process.env, isDirectory);

mkdirSync(dirname(config.databasePath), { recursive: true });
const store = new SqliteLeaderboardStore(config.databasePath);
const service = new LeaderboardService({
  store,
  clock: { now: () => Date.now() },
  ids: { next: () => randomUUID() },
});
const app = createApp({ service, staticDir: config.staticDir });

const server = serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(
    `River Raid API listening on http://localhost:${port} (database: ${config.databasePath}, static files: ${config.staticDir ?? 'none'})`,
  );
});

let shuttingDown = false;

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  // close() stops accepting connections and calls back once the in-flight ones have finished.
  server.close((error) => {
    store.close();
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
