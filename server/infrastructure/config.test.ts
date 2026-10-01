import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

const noDirectories = () => false;
const onlyDist = (path: string) => path === 'dist';

describe('loadConfig', () => {
  it('uses the documented defaults', () => {
    expect(loadConfig({}, noDirectories)).toEqual({
      port: 8787,
      databasePath: 'data/leaderboard.sqlite',
      staticDir: undefined,
    });
  });

  it('hosts the web client from dist when that folder exists', () => {
    expect(loadConfig({}, onlyDist).staticDir).toBe('dist');
  });

  it('reads every setting from the environment', () => {
    const config = loadConfig({ PORT: '9000', DATABASE_PATH: '/var/lib/lb.sqlite', STATIC_DIR: 'public' }, (path) => path === 'public');

    expect(config).toEqual({ port: 9000, databasePath: '/var/lib/lb.sqlite', staticDir: 'public' });
  });

  it('prefers an explicit STATIC_DIR over dist', () => {
    expect(loadConfig({ STATIC_DIR: 'site' }, () => true).staticDir).toBe('site');
  });

  it('treats blank variables as unset', () => {
    const config = loadConfig({ PORT: '', DATABASE_PATH: '  ', STATIC_DIR: '' }, onlyDist);

    expect(config).toEqual({ port: 8787, databasePath: 'data/leaderboard.sqlite', staticDir: 'dist' });
  });

  it.each([['0'], ['65535']])('accepts PORT=%s', (port) => {
    expect(loadConfig({ PORT: port }, noDirectories).port).toBe(Number(port));
  });

  it.each([['abc'], ['-1'], ['1.5'], ['65536'], ['123456'], ['0x10'], ['1e3'], ['80 80']])(
    'rejects PORT=%s',
    (port) => {
      expect(() => loadConfig({ PORT: port }, noDirectories)).toThrow(/PORT/);
    },
  );

  it('rejects a STATIC_DIR that is not an existing directory', () => {
    expect(() => loadConfig({ STATIC_DIR: 'missing' }, onlyDist)).toThrow(/STATIC_DIR/);
  });
});
