import { GameSession } from './application/gameSession.ts';
import { WebAudioSound } from './infrastructure/audio/webAudioSound.ts';
import { browserScheduler } from './infrastructure/browser/browserScheduler.ts';
import { BrowserPreferences } from './infrastructure/browser/browserPreferences.ts';
import { CanvasRenderer } from './infrastructure/canvas/canvasRenderer.ts';
import { HttpLeaderboard } from './infrastructure/http/httpLeaderboard.ts';
import { KeyboardInput } from './infrastructure/input/keyboardInput.ts';
import type { AppServices } from './ui/services.ts';

/** The one place where ports meet their browser adapters. */
export function createServices(): AppServices {
  return {
    leaderboard: new HttpLeaderboard(),
    preferences: new BrowserPreferences(),
    startGame: (canvas, onGameOver) =>
      new GameSession({
        input: new KeyboardInput(),
        renderer: new CanvasRenderer(canvas),
        sound: new WebAudioSound(),
        scheduler: browserScheduler,
        onGameOver,
      }),
  };
}
