import {
  BANK_SLOPE,
  BRIDGE_CHANNEL_WIDTH,
  BRIDGE_HEIGHT,
  MIN_BANK_WIDTH,
  SCREEN_WIDTH,
  SECTION_LENGTH,
  WORLD_SEED,
} from './constants.ts';
import type { Difficulty } from './difficulty.ts';
import { combineSeeds, createRandom, pickWeighted, randomInt, type Random } from './random.ts';

/** Water spans [left, right); an island, when present, spans [islandLeft, islandRight) inside it. */
export interface RiverRow {
  left: number;
  right: number;
  islandLeft: number;
  islandRight: number;
}

export type Interval = readonly [start: number, end: number];

const MAX_RIGHT_BANK = SCREEN_WIDTH - MIN_BANK_WIDTH;
const START_RIVER_WIDTH = 64;
const ENTRY_HOLD_ROWS = 30;
/** Rows kept before the bridge to line the river up with its channel. */
export const APPROACH_ROWS = 110;

export function waterIntervals(row: RiverRow): Interval[] {
  if (row.islandRight <= row.islandLeft) return [[row.left, row.right]];
  return [
    [row.left, row.islandLeft],
    [row.islandRight, row.right],
  ];
}

interface Channel {
  center: number;
  width: number;
}

/** Where the river runs through the bridge that closes section `index - 1` and opens section `index`. */
export function bridgeChannel(index: number): Channel {
  const random = createRandom(combineSeeds(WORLD_SEED ^ 0xb21d, index));
  return { center: SCREEN_WIDTH / 2 + randomInt(random, -20, 20), width: BRIDGE_CHANNEL_WIDTH };
}

function startChannel(index: number): Channel {
  return index === 0 ? { center: SCREEN_WIDTH / 2, width: START_RIVER_WIDTH } : bridgeChannel(index);
}

function stepToward(from: number, to: number): number {
  return Math.sign(to - from) * Math.min(BANK_SLOPE, Math.abs(to - from));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Draws a river one row at a time. Banks move at most BANK_SLOPE columns per row, which is what
 * keeps every shape steerable at the normal scroll speed: the jet slides one column per tick at most,
 * so the steepest bends cannot be followed at the fast one.
 */
class RiverPen {
  readonly rows: RiverRow[] = [];
  private left: number;
  private right: number;
  private islandLeft = 0;
  private islandRight = 0;

  constructor(channel: Channel) {
    this.left = Math.round(channel.center - channel.width / 2);
    this.right = this.left + channel.width;
  }

  get length(): number {
    return this.rows.length;
  }

  get center(): number {
    return (this.left + this.right) / 2;
  }

  get width(): number {
    return this.right - this.left;
  }

  get leftBank(): number {
    return this.left;
  }

  hold(rows: number): void {
    for (let i = 0; i < rows; i++) this.emit();
  }

  moveToChannel(channel: Channel): void {
    const left = clamp(Math.round(channel.center - channel.width / 2), MIN_BANK_WIDTH, MAX_RIGHT_BANK - channel.width);
    this.moveTo(left, left + channel.width);
  }

  growIsland(left: number, right: number): void {
    const middle = Math.floor((left + right) / 2);
    this.islandLeft = middle;
    this.islandRight = middle + 1;
    while (this.islandLeft > left || this.islandRight < right) {
      this.islandLeft = Math.max(left, this.islandLeft - BANK_SLOPE);
      this.islandRight = Math.min(right, this.islandRight + BANK_SLOPE);
      this.emit();
    }
  }

  shrinkIsland(): void {
    while (this.islandRight - this.islandLeft > 2) {
      this.islandLeft += BANK_SLOPE;
      this.islandRight -= BANK_SLOPE;
      this.emit();
    }
    this.islandLeft = 0;
    this.islandRight = 0;
  }

  private moveTo(left: number, right: number): void {
    while (this.left !== left || this.right !== right) {
      this.left += stepToward(this.left, left);
      this.right += stepToward(this.right, right);
      this.emit();
    }
  }

  private emit(): void {
    this.rows.push({
      left: this.left,
      right: this.right,
      islandLeft: this.islandLeft,
      islandRight: this.islandRight,
    });
  }
}

interface Feature {
  /** Upper bound of rows the feature can add, used to make sure it fits before the approach. */
  maxRows: number;
  run: (pen: RiverPen, random: Random, difficulty: Difficulty) => void;
}

const straight: Feature = {
  maxRows: 90,
  run: (pen, random) => pen.hold(randomInt(random, 30, 90)),
};

const drift: Feature = {
  maxRows: 150,
  run: (pen, random, difficulty) => {
    const width = clamp(pen.width, difficulty.minRiverWidth, difficulty.maxRiverWidth);
    pen.moveToChannel({ center: pen.center + randomInt(random, -30, 30), width });
    pen.hold(randomInt(random, 10, 40));
  },
};

const breathe: Feature = {
  maxRows: 150,
  run: (pen, random, difficulty) => {
    const width = randomInt(random, difficulty.minRiverWidth, difficulty.maxRiverWidth);
    pen.moveToChannel({ center: pen.center + randomInt(random, -12, 12), width });
    pen.hold(randomInt(random, 10, 50));
  },
};

const island: Feature = {
  maxRows: 370,
  run: (pen, random, difficulty) => {
    const islandWidth = randomInt(random, 14, 34);
    const leftChannel = randomInt(random, difficulty.minIslandChannel, difficulty.minIslandChannel + 14);
    const rightChannel = randomInt(random, difficulty.minIslandChannel, difficulty.minIslandChannel + 14);
    pen.moveToChannel({
      center: pen.center + randomInt(random, -16, 16),
      width: leftChannel + islandWidth + rightChannel,
    });
    pen.hold(randomInt(random, 10, 24));
    const islandLeft = pen.leftBank + leftChannel;
    pen.growIsland(islandLeft, islandLeft + islandWidth);
    pen.hold(randomInt(random, 60, 170));
    pen.shrinkIsland();
    pen.hold(randomInt(random, 10, 24));
  },
};

function featuresFor(difficulty: Difficulty): ReadonlyArray<readonly [Feature, number]> {
  if (difficulty.terrain === 'light') {
    return [
      [straight, 3],
      [drift, 3],
      [breathe, 2],
    ];
  }
  return [
    [island, 4],
    [drift, 2],
    [breathe, 2],
    [straight, 1],
  ];
}

/** Builds the SECTION_LENGTH rows of one section, bottom row first. */
export function generateRiverRows(index: number, difficulty: Difficulty): RiverRow[] {
  const random = createRandom(combineSeeds(WORLD_SEED, index));
  const pen = new RiverPen(startChannel(index));
  const contentEnd = SECTION_LENGTH - BRIDGE_HEIGHT - APPROACH_ROWS;

  pen.hold(ENTRY_HOLD_ROWS);
  pen.moveToChannel({
    center: pen.center,
    width: Math.round((difficulty.minRiverWidth + difficulty.maxRiverWidth) / 2),
  });

  const features = featuresFor(difficulty);
  for (;;) {
    const remaining = contentEnd - pen.length;
    const fitting = features.filter(([feature]) => feature.maxRows <= remaining);
    if (fitting.length === 0) break;
    pickWeighted(random, fitting).run(pen, random, difficulty);
  }

  pen.moveToChannel(bridgeChannel(index + 1));
  pen.hold(SECTION_LENGTH - pen.length);

  if (pen.length !== SECTION_LENGTH) {
    throw new Error(`Section ${index} generated ${pen.length} rows instead of ${SECTION_LENGTH}`);
  }
  return pen.rows;
}
