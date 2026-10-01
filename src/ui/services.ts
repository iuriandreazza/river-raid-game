import type { LeaderboardPort, Preferences, RunningGame } from '../application/ports.ts';

/** Everything the screens need from the outside world; the composition root provides the real thing. */
export interface AppServices {
  leaderboard: LeaderboardPort;
  preferences: Preferences;
  /** Starts a game on the canvas. `onGameOver` receives the final score once the game over banner is done. */
  startGame(canvas: HTMLCanvasElement, onGameOver: (finalScore: number) => void): RunningGame;
}
