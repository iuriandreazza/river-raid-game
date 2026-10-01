import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore } from '../application/ports.ts';
import type { PlaySession } from '../domain/play-session.ts';
import type { RankedScore, ScoreRecord } from '../domain/score.ts';

const IN_MEMORY_DATABASE = ':memory:';

/** Extended result code of a violated UNIQUE constraint (https://sqlite.org/rescode.html#constraint_unique). */
const SQLITE_CONSTRAINT_UNIQUE = 2067;

// The ranking index mirrors the ORDER BY of the top-scores query; the trailing id keeps the order total.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS play_sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS play_sessions_started_at ON play_sessions (started_at);

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    achieved_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS scores_ranking ON scores (score DESC, achieved_at ASC, id ASC);
`;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && 'errcode' in error && error.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

export class SqliteLeaderboardStore implements LeaderboardStore {
  readonly #database: DatabaseSync;
  readonly #insertSession: StatementSync;
  readonly #selectSession: StatementSync;
  readonly #deleteUnusedSessions: StatementSync;
  readonly #insertScore: StatementSync;
  readonly #countScoresAhead: StatementSync;
  readonly #selectTopScores: StatementSync;

  /** Pass ':memory:' for a throwaway database. */
  constructor(databasePath: string) {
    this.#database = new DatabaseSync(databasePath);
    if (databasePath !== IN_MEMORY_DATABASE) {
      this.#database.exec('PRAGMA journal_mode = WAL');
    }
    this.#database.exec(SCHEMA);

    this.#insertSession = this.#database.prepare('INSERT INTO play_sessions (id, started_at) VALUES (?, ?)');
    this.#selectSession = this.#database.prepare('SELECT id, started_at FROM play_sessions WHERE id = ?');
    this.#deleteUnusedSessions = this.#database.prepare(`
      DELETE FROM play_sessions
      WHERE started_at < ?
        AND NOT EXISTS (SELECT 1 FROM scores WHERE scores.session_id = play_sessions.id)
    `);
    this.#insertScore = this.#database.prepare(
      'INSERT INTO scores (session_id, initials, score, achieved_at) VALUES (?, ?, ?, ?)',
    );
    this.#countScoresAhead = this.#database.prepare(`
      SELECT COUNT(*) AS total FROM scores
      WHERE score > ?1
         OR (score = ?1 AND achieved_at < ?2)
         OR (score = ?1 AND achieved_at = ?2 AND id < ?3)
    `);
    this.#selectTopScores = this.#database.prepare(
      'SELECT initials, score, achieved_at FROM scores ORDER BY score DESC, achieved_at ASC, id ASC LIMIT ?',
    );
  }

  saveSession(session: PlaySession): void {
    this.#insertSession.run(session.id, session.startedAt);
  }

  findSession(sessionId: string): PlaySession | undefined {
    const row = this.#selectSession.get(sessionId);
    return row === undefined ? undefined : { id: row.id as string, startedAt: row.started_at as number };
  }

  deleteUnusedSessionsStartedBefore(cutoff: number): void {
    this.#deleteUnusedSessions.run(cutoff);
  }

  addScore(record: ScoreRecord): RankedScore {
    const id = this.#insertScoreRow(record);
    const { total } = this.#countScoresAhead.get(record.score, record.achievedAt, id) as { total: number };
    return { rank: total + 1, initials: record.initials, score: record.score, achievedAt: record.achievedAt };
  }

  topScores(limit: number): RankedScore[] {
    return this.#selectTopScores.all(limit).map((row, index) => ({
      rank: index + 1,
      initials: row.initials as string,
      score: row.score as number,
      achievedAt: row.achieved_at as number,
    }));
  }

  /** Safe to call more than once. */
  close(): void {
    if (this.#database.isOpen) {
      this.#database.close();
    }
  }

  // The UNIQUE(session_id) constraint, not a prior lookup, decides who wins when two submissions race.
  #insertScoreRow(record: ScoreRecord): number {
    try {
      const result = this.#insertScore.run(record.sessionId, record.initials, record.score, record.achievedAt);
      return Number(result.lastInsertRowid);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new SessionAlreadyUsedError();
      }
      throw error;
    }
  }
}
