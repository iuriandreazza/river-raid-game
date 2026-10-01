import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../constants.ts';
import { advance, createGame } from '../game.ts';
import { MAX_REPLAY_TICKS, ReplayRecorder } from '../replay.ts';
import { waterIntervals, type Interval } from '../river.ts';
import type { GameState, Input } from '../types.ts';
import { jetColumn, noseRowOf } from '../view.ts';
import type { World } from '../world.ts';

/** Rows around the jet that must be clear right now. */
const NEAR_ROWS = 12;
/** Rows ahead whose channel the jet aims for while the river is plain. */
const FAR_ROWS = 28;
/** An island is seen coming from further away, since the jet needs time to sidestep it. */
const ISLAND_SIGHT_ROWS = 70;
/** The jet starts looking for a fuel depot this far ahead. */
const DEPOT_SIGHT_ROWS = 110;
const SAFETY_MARGIN = 6;
const STEERING_DEAD_ZONE = 1;

const width = ([start, end]: Interval): number => end - start;
const middle = ([start, end]: Interval): number => (start + end) / 2;
const overlap = (a: Interval, b: Interval): Interval => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];

function closestTo(intervals: Interval[], column: number): Interval {
  return intervals.reduce((best, interval) =>
    Math.abs(middle(interval) - column) < Math.abs(middle(best) - column) ? interval : best,
  );
}

/** The water that stays free from the tail of the jet to a few rows ahead of its nose, in the channel it is in. */
function nearCorridor(world: World, nose: number, jetMiddle: number): Interval {
  const tail = nose - (PLAYER_HEIGHT - 1);
  let corridor = closestTo(waterIntervals(world.rowAt(tail)), jetMiddle);
  for (let row = tail + 1; row <= nose + NEAR_ROWS; row++) {
    const narrowed = waterIntervals(world.rowAt(row))
      .map((interval) => overlap(corridor, interval))
      .filter((interval) => width(interval) > 0);
    if (narrowed.length === 0) break;
    corridor = closestTo(narrowed, jetMiddle);
  }
  return corridor;
}

function islandAhead(world: World, nose: number): boolean {
  for (let row = nose; row <= nose + ISLAND_SIGHT_ROWS; row++) {
    if (waterIntervals(world.rowAt(row)).length > 1) return true;
  }
  return false;
}

/**
 * A pilot that steers for the middle of the channel ahead, heads for fuel depots and keeps firing,
 * but never dodges enemies. If it cannot fly the river, nobody can.
 */
export function pilot(state: GameState): Input {
  const { world } = state;
  const nose = noseRowOf(state.scroll);
  const jetMiddle = jetColumn(state.playerX) + PLAYER_WIDTH / 2;

  const lookAhead = nose + (islandAhead(world, nose) ? ISLAND_SIGHT_ROWS : FAR_ROWS);
  const channel = closestTo(waterIntervals(world.rowAt(lookAhead)), jetMiddle);
  const depot = state.depots.find((candidate) => candidate.y + candidate.height > nose && candidate.y - nose < DEPOT_SIGHT_ROWS);
  const wanted = depot ? depot.x + depot.width / 2 : middle(channel);

  const clear = nearCorridor(world, nose, jetMiddle);
  const margin = Math.min(SAFETY_MARGIN, width(clear) / 2);
  const target = Math.min(clear[1] - margin, Math.max(clear[0] + margin, wanted));

  // A depot in the line of fire would be shot down before it could refuel the jet.
  const depotInLine = state.depots.some(
    (candidate) => candidate.y + candidate.height > nose && Math.abs(candidate.x + candidate.width / 2 - jetMiddle) < 12,
  );
  return {
    left: target < jetMiddle - STEERING_DEAD_ZONE,
    right: target > jetMiddle + STEERING_DEAD_ZONE,
    up: false,
    down: false,
    fire: !depotInLine,
  };
}

/** How much room the cautious pilot leaves beside an enemy it steers around. */
const SIDESTEP = 10;
/** Water must stay this far from a bank for the cautious pilot to go there. */
const BANK_ROOM = 6;

function fitsInWater(world: World, row: number, column: number): boolean {
  return waterIntervals(world.rowAt(row)).some(([start, end]) => column > start + BANK_ROOM && column < end - BANK_ROOM);
}

/** The pilot, plus a sidestep around tankers and helicopters that are about to get in its way. */
export function cautiousPilot(state: GameState): Input {
  const input = pilot(state);
  const nose = noseRowOf(state.scroll);
  const jetMiddle = jetColumn(state.playerX) + PLAYER_WIDTH / 2;
  for (const enemy of state.enemies) {
    const ahead = enemy.y - nose;
    if (enemy.kind === 'jet' || ahead < -12 || ahead > 55) continue;
    const center = enemy.x + enemy.width / 2;
    const clearance = enemy.width / 2 + SIDESTEP;
    if (Math.abs(center - jetMiddle) >= clearance) continue;

    const preferred = jetMiddle >= center ? 1 : -1;
    const side = fitsInWater(state.world, nose + Math.max(ahead, 0), center + preferred * (clearance + 4)) ? preferred : -preferred;
    const wanted = center + side * (clearance + 4);
    input.left = wanted < jetMiddle - STEERING_DEAD_ZONE;
    input.right = wanted > jetMiddle + STEERING_DEAD_ZONE;
  }
  return input;
}

/** Jabs at the controls at random (but always the same random for the same seed) every few ticks. */
export function noisyPolicy(seed: number): (state: GameState, tick: number) => Input {
  let random = seed >>> 0;
  const next = (): number => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  let held: Input = { left: false, right: false, up: false, down: false, fire: true };
  return (_state, tick) => {
    if (tick % 15 === 0) {
      held = { left: next() < 0.4, right: next() < 0.4, up: next() < 0.2, down: next() < 0.2, fire: next() < 0.8 };
    }
    return held;
  };
}

export interface RecordedRun {
  replay: number[];
  score: number;
  ticks: number;
}

/** Plays a whole game the way the web client does, writing the controls down as it goes. */
export function recordRun(policy: (state: GameState, tick: number) => Input, maxTicks = MAX_REPLAY_TICKS): RecordedRun {
  const state = createGame();
  const recorder = new ReplayRecorder();
  let ticks = 0;
  while (state.phase !== 'gameOver' && ticks < maxTicks) {
    const input = policy(state, ticks);
    advance(state, input);
    recorder.record(input);
    ticks++;
  }
  return { replay: recorder.replay(), score: state.score, ticks };
}
