import { TICKS_PER_SECOND } from './constants.ts';
import { advance, createGame } from './game.ts';
import type { Input } from './types.ts';

/**
 * Bump this when a change to the rules alters where a recorded run ends up. The API refuses replays made by
 * another version, and the golden runs in the tests fail until they are recorded again, so a rules change
 * cannot slip through unnoticed and make honest replays fail.
 */
export const ENGINE_VERSION = 1;

/** The longest run the API will re-play: two hours of flying. */
export const MAX_REPLAY_TICKS = 2 * 60 * 60 * TICKS_PER_SECOND;
export const MAX_REPLAY_RUNS = 50_000;

/**
 * Everything a player pressed during a game, which is all it takes to play it again: pairs of
 * `[controls, ticks]`, flattened, where `controls` is a bitmask and `ticks` how long it was held.
 */
export type Replay = readonly number[];

const CONTROL_BITS = { left: 1, right: 2, up: 4, down: 8, fire: 16 } as const;
const ALL_CONTROLS = 31;

export function encodeInput(input: Input): number {
  return (
    (input.left ? CONTROL_BITS.left : 0) |
    (input.right ? CONTROL_BITS.right : 0) |
    (input.up ? CONTROL_BITS.up : 0) |
    (input.down ? CONTROL_BITS.down : 0) |
    (input.fire ? CONTROL_BITS.fire : 0)
  );
}

export function decodeInput(controls: number): Input {
  return {
    left: (controls & CONTROL_BITS.left) !== 0,
    right: (controls & CONTROL_BITS.right) !== 0,
    up: (controls & CONTROL_BITS.up) !== 0,
    down: (controls & CONTROL_BITS.down) !== 0,
    fire: (controls & CONTROL_BITS.fire) !== 0,
  };
}

/** Writes down the controls tick by tick, merging neighbours that are the same. */
export class ReplayRecorder {
  private readonly pairs: number[] = [];

  record(input: Input): void {
    const controls = encodeInput(input);
    const last = this.pairs.length - 2;
    if (last >= 0 && this.pairs[last] === controls) this.pairs[last + 1]!++;
    else this.pairs.push(controls, 1);
  }

  replay(): number[] {
    return [...this.pairs];
  }
}

export function replayTicks(replay: Replay): number {
  let ticks = 0;
  for (let i = 1; i < replay.length; i += 2) ticks += replay[i]!;
  return ticks;
}

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/** Why an untrusted value cannot be a replay, or null when its shape is fine. It says nothing about the run itself. */
export function replayProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0) {
    return 'replay must be a non-empty array of [controls, ticks] pairs.';
  }
  if (value.length > MAX_REPLAY_RUNS * 2) return `replay must not hold more than ${MAX_REPLAY_RUNS} runs.`;

  let ticks = 0;
  for (let i = 0; i < value.length; i += 2) {
    const controls: unknown = value[i];
    const held: unknown = value[i + 1];
    if (!isInteger(controls) || controls < 0 || controls > ALL_CONTROLS) {
      return `replay controls must be integers from 0 to ${ALL_CONTROLS}.`;
    }
    if (!isInteger(held) || held < 1) return 'replay tick counts must be positive integers.';
    // One way to write each game down, so that the same game cannot be sent twice dressed up as two different replays.
    if (i >= 2 && controls === value[i - 2]) return 'replay must merge neighbouring runs that hold the same controls.';
    ticks += held;
    if (ticks > MAX_REPLAY_TICKS) return `replay must not be longer than ${MAX_REPLAY_TICKS} ticks.`;
  }
  return null;
}

export type ReplayVerdict =
  | { ok: true; score: number; ticks: number }
  | { ok: false; reason: 'unfinished' | 'continued_after_game_over' };

/**
 * Plays the replay from the very start of a game. A real run ends the moment the game turns over, when the last jet
 * has finished exploding, so a replay that stops before that, or goes on after it, is not a recording of a finished game.
 * The shape must have been checked with {@link replayProblem}.
 */
export function verifyReplay(replay: Replay): ReplayVerdict {
  const state = createGame();
  let ticks = 0;
  for (let i = 0; i < replay.length; i += 2) {
    const input = decodeInput(replay[i]!);
    for (let held = 0; held < replay[i + 1]!; held++) {
      if (state.phase === 'gameOver') return { ok: false, reason: 'continued_after_game_over' };
      advance(state, input);
      ticks++;
    }
  }
  if (state.phase !== 'gameOver') return { ok: false, reason: 'unfinished' };
  return { ok: true, score: state.score, ticks };
}
