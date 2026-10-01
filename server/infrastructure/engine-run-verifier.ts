import { verifyReplay, type Replay, type ReplayVerdict } from '../../shared/game/replay.ts';
import type { RunVerdict, RunVerifier } from '../application/ports.ts';

/** Plays recordings with the very engine the players run, which lives in shared/game. */
export class EngineRunVerifier implements RunVerifier {
  readonly #play: (replay: Replay) => ReplayVerdict;

  constructor(play: (replay: Replay) => ReplayVerdict = verifyReplay) {
    this.#play = play;
  }

  verify(replay: Replay): RunVerdict {
    try {
      return this.#play(replay);
    } catch (error) {
      // Not the player's fault: an honest run may have hit a bug in the engine, which is worth a loud line in the log.
      console.error('The game engine threw while verifying a replay:', error);
      return { ok: false, reason: 'engine_error' };
    }
  }
}
