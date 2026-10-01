import { vi } from 'vitest';
import type { LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import type { LeaderboardPort, Preferences, RunningGame } from '../application/ports.ts';
import type { AppServices } from './services.ts';

export function entry(rank: number, initials: string, score: number): LeaderboardEntry {
  return { rank, initials, score, achievedAt: '2026-10-01T12:00:00.000Z' };
}

export class FakeLeaderboard implements LeaderboardPort {
  entries: LeaderboardEntry[] = [];
  startSession = vi.fn<LeaderboardPort['startSession']>(async () => 'session-1');
  submitScore = vi.fn<LeaderboardPort['submitScore']>(async ({ initials, score }) => {
    const saved = entry(1, initials, score);
    this.entries = [saved, ...this.entries];
    return saved;
  });
  topScores = vi.fn<LeaderboardPort['topScores']>(async () => this.entries);
}

export class FakePreferences implements Preferences {
  initials = '';
  muted = false;
  loadInitials = vi.fn(() => this.initials);
  saveInitials = vi.fn((initials: string) => {
    this.initials = initials;
  });
  loadMuted = vi.fn(() => this.muted);
  saveMuted = vi.fn((muted: boolean) => {
    this.muted = muted;
  });
}

export interface FakeGame extends RunningGame {
  finish(score: number): void;
}

/** Services whose games never touch a canvas, keyboard or speaker; a test ends them with `finish`. */
export function createFakeServices() {
  const leaderboard = new FakeLeaderboard();
  const preferences = new FakePreferences();
  const games: FakeGame[] = [];
  const services: AppServices = {
    leaderboard,
    preferences,
    startGame: (_canvas, onGameOver) => {
      const game: FakeGame = {
        pause: vi.fn(),
        resume: vi.fn(),
        setMuted: vi.fn(),
        dispose: vi.fn(),
        finish: (score) => onGameOver(score),
      };
      games.push(game);
      return game;
    },
  };
  return { services, leaderboard, preferences, games };
}
