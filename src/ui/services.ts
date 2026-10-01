import type { LeaderboardPort, Preferences, RunResult, RunningGame } from '../application/ports.ts';

/** Everything the screens need from the outside world; the composition root provides the real thing. */
export interface AppServices {
  leaderboard: LeaderboardPort;
  preferences: Preferences;
  /** Starts a game on the canvas. `onGameOver` receives how it ended once the game over banner is done. */
  startGame(canvas: HTMLCanvasElement, onGameOver: (result: RunResult) => void): RunningGame;
}
