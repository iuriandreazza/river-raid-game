import type { ApiErrorCode, LeaderboardEntry } from '../../shared/leaderboard-contract.ts';
import type { GameEvent, GameState, Input } from '../domain/types.ts';

export interface InputPort {
  /** Current state of the controls. */
  read(): Input;
  dispose(): void;
}

export interface RendererPort {
  render(state: GameState): void;
}

export interface SoundPort {
  /** Plays the one-shot sound that goes with an event. */
  play(event: GameEvent): void;
  /** Keeps the continuous sounds (engine, low-fuel siren, refuel bell) in step with the game. */
  sync(state: GameState): void;
  setPaused(paused: boolean): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

/** Calls `callback` before every repaint, like requestAnimationFrame. */
export interface FrameScheduler {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export interface SubmitScoreInput {
  sessionId: string;
  initials: string;
  score: number;
}

export interface LeaderboardPort {
  /** Registers the start of a run; the returned id is what a score must be submitted with. */
  startSession(): Promise<string>;
  submitScore(input: SubmitScoreInput): Promise<LeaderboardEntry>;
  topScores(limit?: number): Promise<LeaderboardEntry[]>;
}

export type LeaderboardErrorCode = ApiErrorCode | 'network' | 'unexpected';

export class LeaderboardError extends Error {
  readonly code: LeaderboardErrorCode;

  constructor(code: LeaderboardErrorCode, message: string) {
    super(message);
    this.name = 'LeaderboardError';
    this.code = code;
  }
}

/** Small settings that survive a page reload. */
export interface Preferences {
  loadInitials(): string;
  saveInitials(initials: string): void;
  loadMuted(): boolean;
  saveMuted(muted: boolean): void;
}

/** A game that is running on a canvas, as seen by the UI. */
export interface RunningGame {
  pause(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}
