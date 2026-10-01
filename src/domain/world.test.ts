import { describe, expect, it } from 'vitest';
import {
  BANK_SLOPE,
  BRIDGE_CHANNEL_WIDTH,
  BRIDGE_HEIGHT,
  MIN_BANK_WIDTH,
  MIN_CHANNEL_WIDTH,
  PLAYER_SPEED_X,
  SCREEN_WIDTH,
  SCROLL_SPEEDS,
  SECTION_LENGTH,
} from './constants.ts';
import { waterIntervals, type RiverRow } from './river.ts';
import { World } from './world.ts';

const SECTIONS_TO_CHECK = 80;
const sectionIndexes = Array.from({ length: SECTIONS_TO_CHECK }, (_, index) => index);

function allRows(world: World): Array<{ row: RiverRow; y: number; section: number }> {
  return sectionIndexes.flatMap((section) =>
    world.plan(section).rows.map((row, offset) => ({ row, y: section * SECTION_LENGTH + offset, section })),
  );
}

describe('World', () => {
  it('builds the same river every time', () => {
    const first = new World();
    const second = new World();
    for (const section of [0, 1, 5, 23, 61]) {
      expect(second.plan(section).rows).toEqual(first.plan(section).rows);
      expect(second.plan(section).spawns).toEqual(first.plan(section).spawns);
    }
  });

  it('makes consecutive sections different', () => {
    const world = new World();
    expect(world.plan(3).rows).not.toEqual(world.plan(4).rows);
  });

  it('gives every section exactly SECTION_LENGTH rows', () => {
    const world = new World();
    for (const section of sectionIndexes) expect(world.plan(section).rows).toHaveLength(SECTION_LENGTH);
  });

  it('keeps banks on screen and channels wide enough for the jet', () => {
    const problems: string[] = [];
    for (const { row, y } of allRows(new World())) {
      if (row.left < MIN_BANK_WIDTH || row.right > SCREEN_WIDTH - MIN_BANK_WIDTH) problems.push(`bank off screen at ${y}`);
      const hasIsland = row.islandRight > row.islandLeft;
      const minimum = hasIsland ? MIN_CHANNEL_WIDTH : BRIDGE_CHANNEL_WIDTH;
      for (const [start, end] of waterIntervals(row)) {
        if (end - start < minimum) problems.push(`channel of ${end - start} columns at ${y}`);
      }
      if (hasIsland && (row.islandLeft <= row.left || row.islandRight >= row.right)) problems.push(`island touches a bank at ${y}`);
    }
    expect(problems).toEqual([]);
  });

  it('moves every bank at most BANK_SLOPE columns per row, even across sections', () => {
    const problems: string[] = [];
    const rows = allRows(new World());
    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1]!.row;
      const current = rows[i]!.row;
      const y = rows[i]!.y;
      if (Math.abs(current.left - previous.left) > BANK_SLOPE) problems.push(`left bank jumps at ${y}`);
      if (Math.abs(current.right - previous.right) > BANK_SLOPE) problems.push(`right bank jumps at ${y}`);
      const islandInBoth = current.islandRight > current.islandLeft && previous.islandRight > previous.islandLeft;
      if (islandInBoth && Math.abs(current.islandLeft - previous.islandLeft) > BANK_SLOPE) problems.push(`island jumps at ${y}`);
    }
    expect(problems).toEqual([]);
  });

  it('can always be followed at the fastest scroll speed', () => {
    expect(BANK_SLOPE * SCROLL_SPEEDS.fast).toBeLessThanOrEqual(PLAYER_SPEED_X);
  });

  it('only puts islands in dark-green sections', () => {
    const world = new World();
    for (const section of sectionIndexes) {
      const plan = world.plan(section);
      const hasIsland = plan.rows.some((row) => row.islandRight > row.islandLeft);
      if (plan.terrain === 'light') expect(hasIsland, `section ${section}`).toBe(false);
    }
    expect(world.plan(0).terrain).toBe('light');
    expect(sectionIndexes.some((section) => world.plan(section).terrain === 'dark')).toBe(true);
  });

  it('runs every bridge over a narrow channel that continues into the next section', () => {
    const world = new World();
    for (const section of sectionIndexes) {
      const rows = world.plan(section).rows;
      const bridgeRows = rows.slice(SECTION_LENGTH - BRIDGE_HEIGHT);
      for (const row of bridgeRows) {
        expect(row.right - row.left).toBe(BRIDGE_CHANNEL_WIDTH);
        expect(row.islandRight).toBe(row.islandLeft);
      }
      expect(world.plan(section + 1).rows[0]).toEqual(rows[SECTION_LENGTH - 1]);
    }
  });

  it('locates bridge rows', () => {
    const world = new World();
    const bottom = world.bridgeBottom(2);
    expect(world.bridgeSectionAt(bottom - 1)).toBeNull();
    expect(world.bridgeSectionAt(bottom)).toBe(2);
    expect(world.bridgeSectionAt(bottom + BRIDGE_HEIGHT - 1)).toBe(2);
    expect(world.bridgeSectionAt(bottom + BRIDGE_HEIGHT)).toBeNull();
  });

  it('reuses the first row for rows below the start of the river', () => {
    const world = new World();
    expect(world.rowAt(-20)).toEqual(world.rowAt(0));
  });
});
