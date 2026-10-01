import { describe, expect, it } from 'vitest';
import { MAX_SCORE_PER_SECOND } from '../scoring-limits.ts';
import {
  FUEL_DRAIN_PER_TICK,
  OBJECT_SIZES,
  POINTS,
  SCROLL_SPEEDS,
  SECTION_LENGTH,
  TICKS_PER_SECOND,
} from './constants.ts';
import { waterIntervals } from './river.ts';
import type { Spawn } from './spawns.ts';
import { World } from './world.ts';

const SECTIONS_TO_CHECK = 80;
const sectionIndexes = Array.from({ length: SECTIONS_TO_CHECK }, (_, index) => index);
const world = new World();

function isOnWater(spawn: Spawn): boolean {
  const { width, height } = OBJECT_SIZES[spawn.kind];
  for (let row = spawn.y; row < spawn.y + height; row++) {
    const fits = waterIntervals(world.rowAt(row)).some(([start, end]) => spawn.x >= start && spawn.x + width <= end);
    if (!fits) return false;
  }
  return true;
}

describe('object placement', () => {
  it('floats depots and patrolling enemies on open water', () => {
    const problems: string[] = [];
    for (const section of sectionIndexes) {
      for (const spawn of world.plan(section).spawns) {
        if (spawn.kind !== 'jet' && !isOnWater(spawn)) problems.push(`${spawn.kind} at ${spawn.y}`);
        if (spawn.kind !== 'jet' && (spawn.x < spawn.patrolMin || spawn.x > spawn.patrolMax)) {
          problems.push(`${spawn.kind} at ${spawn.y} starts outside its patrol range`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps objects apart and away from the bridge and the section entry', () => {
    const problems: string[] = [];
    for (const section of sectionIndexes) {
      const plan = world.plan(section);
      const bridgeBottom = world.bridgeBottom(section);
      plan.spawns.forEach((spawn, i) => {
        const { height } = OBJECT_SIZES[spawn.kind];
        if (spawn.y + height > bridgeBottom) problems.push(`${spawn.kind} reaches the bridge in section ${section}`);
        if (spawn.y < plan.startRow + 100) problems.push(`${spawn.kind} too close to the entry of section ${section}`);
        const next = plan.spawns[i + 1];
        if (next && next.y < spawn.y + height + 10) problems.push(`${spawn.kind} and ${next.kind} overlap at ${spawn.y}`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('puts at least two fuel depots in every section', () => {
    for (const section of sectionIndexes) {
      const depots = world.plan(section).spawns.filter((spawn) => spawn.kind === 'fuel');
      expect(depots.length, `section ${section}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the next depot within reach of a full tank flown at the slowest speed', () => {
    const reachOnFullTank = SCROLL_SPEEDS.slow / FUEL_DRAIN_PER_TICK;
    const depotRows = sectionIndexes
      .flatMap((section) => world.plan(section).spawns)
      .filter((spawn) => spawn.kind === 'fuel')
      .map((spawn) => spawn.y);
    for (let i = 1; i < depotRows.length; i++) {
      expect(depotRows[i]! - depotRows[i - 1]!).toBeLessThan(reachOnFullTank);
    }
  });

  it('never offers more points per second than the API accepts', () => {
    const secondsPerSectionAtFullSpeed = SECTION_LENGTH / SCROLL_SPEEDS.fast / TICKS_PER_SECOND;
    for (const section of sectionIndexes) {
      const pointsInSection =
        POINTS.bridge + world.plan(section).spawns.reduce((sum, spawn) => sum + POINTS[spawn.kind], 0);
      expect(pointsInSection / secondsPerSectionAtFullSpeed, `section ${section}`).toBeLessThan(MAX_SCORE_PER_SECOND);
    }
  });
});
