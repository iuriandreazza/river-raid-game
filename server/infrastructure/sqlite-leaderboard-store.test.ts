import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionAlreadyUsedError } from '../application/errors.ts';
import { SqliteLeaderboardStore } from './sqlite-leaderboard-store.ts';

describe('SqliteLeaderboardStore on a database file', () => {
  let directory: string;
  let databasePath: string;
  let openedStores: SqliteLeaderboardStore[];

  function openStore(): SqliteLeaderboardStore {
    const store = new SqliteLeaderboardStore(databasePath);
    openedStores.push(store);
    return store;
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'river-raid-store-'));
    databasePath = join(directory, 'leaderboard.sqlite');
    openedStores = [];
  });

  afterEach(() => {
    // Windows cannot delete a file that is still open, so every handle goes first.
    for (const store of openedStores) {
      store.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('can be closed more than once', () => {
    const store = openStore();

    store.close();

    expect(() => store.close()).not.toThrow();
  });

  it('keeps sessions and scores after being closed and reopened', () => {
    const first = openStore();
    first.saveSession({ id: 'session-1', startedAt: 1_700_000_000_000 });
    first.addScore({ sessionId: 'session-1', initials: 'ABC', score: 700, achievedAt: 1_700_000_005_000 });
    first.close();

    const reopened = openStore();

    expect(reopened.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1_700_000_000_000 });
    expect(reopened.topScores(10)).toEqual([
      { rank: 1, initials: 'ABC', score: 700, achievedAt: 1_700_000_005_000 },
    ]);
    expect(() =>
      reopened.addScore({ sessionId: 'session-1', initials: 'ZZZ', score: 1, achievedAt: 1_700_000_006_000 }),
    ).toThrow(SessionAlreadyUsedError);
  });

  it('keeps ranking new scores correctly after being reopened', () => {
    const first = openStore();
    first.addScore({ sessionId: 's1', initials: 'AAA', score: 500, achievedAt: 1_000 });
    first.close();

    const reopened = openStore();

    expect(reopened.addScore({ sessionId: 's2', initials: 'BBB', score: 500, achievedAt: 1_000 }).rank).toBe(2);
  });

  it('creates the database file with write-ahead logging', () => {
    openStore();
    const inspector = new DatabaseSync(databasePath);

    try {
      expect(inspector.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    } finally {
      inspector.close();
    }
  });

  it('lets two connections to the same file share their data', () => {
    const writer = openStore();
    const reader = openStore();

    writer.saveSession({ id: 'session-1', startedAt: 1 });

    expect(reader.findSession('session-1')).toEqual({ id: 'session-1', startedAt: 1 });
  });

  it('lets exactly one of two connections that race for the same session win', () => {
    const first = openStore();
    const second = openStore();

    const outcomes = [first, second].map((store) => {
      try {
        store.addScore({ sessionId: 'contested', initials: 'AAA', score: 100, achievedAt: 1_000 });
        return 'stored';
      } catch (error) {
        return error instanceof SessionAlreadyUsedError ? 'rejected' : 'failed';
      }
    });

    expect(outcomes).toEqual(['stored', 'rejected']);
    expect(first.topScores(10)).toHaveLength(1);
  });

  it('has the database itself reject a second score for a session, whoever writes it', () => {
    const store = openStore();
    store.addScore({ sessionId: 'session-1', initials: 'AAA', score: 100, achievedAt: 1_000 });
    const intruder = new DatabaseSync(databasePath);

    try {
      expect(() =>
        intruder
          .prepare('INSERT INTO scores (session_id, initials, score, achieved_at) VALUES (?, ?, ?, ?)')
          .run('session-1', 'ZZZ', 999, 2_000),
      ).toThrow(/UNIQUE/);
    } finally {
      intruder.close();
    }
  });
});

describe('SqliteLeaderboardStore on :memory:', () => {
  it('gives every store its own empty database', () => {
    const first = new SqliteLeaderboardStore(':memory:');
    const second = new SqliteLeaderboardStore(':memory:');

    try {
      first.addScore({ sessionId: 's1', initials: 'AAA', score: 100, achievedAt: 1_000 });

      expect(second.topScores(10)).toEqual([]);
    } finally {
      first.close();
      second.close();
    }
  });
});
