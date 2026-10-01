import { describe, expect, it } from 'vitest';
import { PLAYER_HEIGHT, PLAYER_WIDTH, SECTION_LENGTH, STARTING_RESERVE_JETS } from './constants.ts';
import { advance, createGame } from './game.ts';
import { waterIntervals, type Interval } from './river.ts';
import type { GameState, Input } from './types.ts';
import { jetColumn, noseRowOf } from './view.ts';
import type { World } from './world.ts';

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
function pilot(state: GameState): Input {
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

describe('the river', () => {
  it('can be flown by a pilot that only follows the water, refuels and shoots the bridges', () => {
    const state = createGame();
    const sections = 30;
    const ticks = sections * SECTION_LENGTH * 1.2;

    for (let tick = 0; tick < ticks && state.scroll < sections * SECTION_LENGTH; tick++) {
      state.enemies = [];
      advance(state, pilot(state));
      expect(state.phase, `crashed at row ${noseRowOf(state.scroll)}`).toBe('playing');
    }

    expect(state.scroll).toBeGreaterThanOrEqual(sections * SECTION_LENGTH);
    expect(state.reserveJets).toBeGreaterThanOrEqual(STARTING_RESERVE_JETS);
    expect(state.destroyedBridges.size).toBe(sections);
  });
});
