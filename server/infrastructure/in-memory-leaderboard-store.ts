import { SessionAlreadyUsedError } from '../application/errors.ts';
import type { LeaderboardStore } from '../application/ports.ts';
import type { PlaySession } from '../domain/play-session.ts';
import type { RankedScore, ScoreRecord } from '../domain/score.ts';

interface StoredScore extends ScoreRecord {
  readonly id: number;
}

/** Negative when `a` ranks above `b`: higher score first, then earlier achievement, then earlier insertion. */
function compareRanking(a: StoredScore, b: StoredScore): number {
  return b.score - a.score || a.achievedAt - b.achievedAt || a.id - b.id;
}

function toRankedScore(stored: StoredScore, rank: number): RankedScore {
  return { rank, initials: stored.initials, score: stored.score, achievedAt: stored.achievedAt };
}

export class InMemoryLeaderboardStore implements LeaderboardStore {
  readonly #sessions = new Map<string, PlaySession>();
  readonly #scores: StoredScore[] = [];
  #lastScoreId = 0;

  saveSession(session: PlaySession): void {
    this.#sessions.set(session.id, session);
  }

  findSession(sessionId: string): PlaySession | undefined {
    return this.#sessions.get(sessionId);
  }

  deleteUnusedSessionsStartedBefore(cutoff: number): void {
    const usedSessionIds = new Set(this.#scores.map((stored) => stored.sessionId));
    for (const session of this.#sessions.values()) {
      if (session.startedAt < cutoff && !usedSessionIds.has(session.id)) {
        this.#sessions.delete(session.id);
      }
    }
  }

  addScore(record: ScoreRecord): RankedScore {
    if (this.#scores.some((stored) => stored.sessionId === record.sessionId)) {
      throw new SessionAlreadyUsedError();
    }
    const stored: StoredScore = { ...record, id: (this.#lastScoreId += 1) };
    this.#scores.push(stored);
    const scoresAhead = this.#scores.filter((other) => compareRanking(other, stored) < 0).length;
    return toRankedScore(stored, scoresAhead + 1);
  }

  topScores(limit: number): RankedScore[] {
    return [...this.#scores]
      .sort(compareRanking)
      .slice(0, limit)
      .map((stored, index) => toRankedScore(stored, index + 1));
  }
}
