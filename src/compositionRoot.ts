import { GameSession } from './application/gameSession.ts';
import type { SoundPort } from './application/ports.ts';
import { silentSound } from './infrastructure/audio/silentSound.ts';
import { WebAudioSound } from './infrastructure/audio/webAudioSound.ts';
import { browserScheduler } from './infrastructure/browser/browserScheduler.ts';
import { BrowserPreferences } from './infrastructure/browser/browserPreferences.ts';
import { CanvasRenderer } from './infrastructure/canvas/canvasRenderer.ts';
import { HttpLeaderboard } from './infrastructure/http/httpLeaderboard.ts';
import { KeyboardInput } from './infrastructure/input/keyboardInput.ts';
import type { AppServices } from './ui/services.ts';

export function createSound(): SoundPort {
  try {
    return new WebAudioSound();
  } catch {
    return silentSound;
  }
}

/** The one place where ports meet their browser adapters. */
export function createServices(): AppServices {
  return {
    leaderboard: new HttpLeaderboard(),
    preferences: new BrowserPreferences(),
    startGame: (canvas, onGameOver) => {
      // The keyboard goes last: if anything before it fails, nothing is left listening on the window.
      const renderer = new CanvasRenderer(canvas);
      const sound = createSound();
      return new GameSession({ input: new KeyboardInput(), renderer, sound, scheduler: browserScheduler, onGameOver });
    },
  };
}
