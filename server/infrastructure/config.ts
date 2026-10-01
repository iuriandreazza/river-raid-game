const DEFAULT_PORT = 8787;
const MAX_PORT = 65_535;
const DEFAULT_DATABASE_PATH = 'data/leaderboard.sqlite';
const DEFAULT_STATIC_DIR = 'dist';

const PORT_PATTERN = /^[0-9]{1,5}$/;

export interface ServerConfig {
  readonly port: number;
  readonly databasePath: string;
  /** Undefined when the API should not host the web client. */
  readonly staticDir: string | undefined;
}

/** A variable that is set but blank counts as unset, as `.env` files often declare `NAME=` to mean "default". */
function readVariable(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value === '' ? undefined : value;
}

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }
  if (!PORT_PATTERN.test(rawPort) || Number(rawPort) > MAX_PORT) {
    throw new Error(`PORT must be an integer between 0 and ${MAX_PORT}, got "${rawPort}".`);
  }
  return Number(rawPort);
}

function resolveStaticDir(configured: string | undefined, isDirectory: (path: string) => boolean): string | undefined {
  if (configured === undefined) {
    return isDirectory(DEFAULT_STATIC_DIR) ? DEFAULT_STATIC_DIR : undefined;
  }
  // An explicit but wrong path would otherwise surface as a silently empty site.
  if (!isDirectory(configured)) {
    throw new Error(`STATIC_DIR must be an existing directory, got "${configured}".`);
  }
  return configured;
}

export function loadConfig(env: NodeJS.ProcessEnv, isDirectory: (path: string) => boolean): ServerConfig {
  return {
    port: parsePort(readVariable(env, 'PORT')),
    databasePath: readVariable(env, 'DATABASE_PATH') ?? DEFAULT_DATABASE_PATH,
    staticDir: resolveStaticDir(readVariable(env, 'STATIC_DIR'), isDirectory),
  };
}
