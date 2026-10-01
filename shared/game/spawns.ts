import { BRIDGE_HEIGHT, OBJECT_SIZES, SCREEN_WIDTH, SECTION_LENGTH, type ObjectKind } from './constants.ts';
import type { Difficulty } from './difficulty.ts';
import { pickWeighted, randomInt, type Random } from './random.ts';
import { waterIntervals, type Interval, type RiverRow } from './river.ts';

export interface Spawn {
  kind: ObjectKind;
  /** Absolute world row of the object's lowest row. */
  y: number;
  /** Left column when the object appears. Jets start outside the screen and cross it. */
  x: number;
  direction: 1 | -1;
  /** Columns per tick; zero for fuel depots. */
  speed: number;
  /** Range the left column of a patrolling object stays in. */
  patrolMin: number;
  patrolMax: number;
}

/** Calm rows above the start of a section, so a respawned jet never begins in the middle of a fight. */
const ENTRY_CLEARANCE = 130;
/** Rows below the bridge kept free of objects, so the bridge is always easy to line up. */
const BRIDGE_CLEARANCE = 60;
/** Free rows kept between two objects. */
const OBJECT_PADDING = 14;
const LANE_MARGIN = 4;
const SEARCH_OFFSETS = [0, ...Array.from({ length: 15 }, (_, i) => [(i + 1) * 6, -(i + 1) * 6]).flat()];

function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const [aStart, aEnd] of a) {
    for (const [bStart, bEnd] of b) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) result.push([start, end]);
    }
  }
  return result;
}

/** Water columns that stay free for every row from `y` up to `y + height`. */
function lanesFor(rows: readonly RiverRow[], sectionStart: number, y: number, height: number, minWidth: number): Interval[] {
  let lanes = waterIntervals(rows[y - sectionStart]!);
  for (let row = y + 1; row < y + height; row++) {
    lanes = intersect(lanes, waterIntervals(rows[row - sectionStart]!));
  }
  return lanes.filter(([start, end]) => end - start >= minWidth);
}

export function generateSpawns(
  sectionStart: number,
  rows: readonly RiverRow[],
  random: Random,
  difficulty: Difficulty,
): Spawn[] {
  const contentStart = sectionStart + ENTRY_CLEARANCE;
  const contentEnd = sectionStart + SECTION_LENGTH - BRIDGE_HEIGHT - BRIDGE_CLEARANCE;
  const spawns: Spawn[] = [];
  const occupied: Interval[] = [];

  const isFree = (y: number, height: number): boolean =>
    occupied.every(([start, end]) => y + height + OBJECT_PADDING <= start || y >= end + OBJECT_PADDING);

  const place = (kind: ObjectKind, desiredY: number): boolean => {
    const { width, height } = OBJECT_SIZES[kind];
    for (const offset of SEARCH_OFFSETS) {
      const y = desiredY + offset;
      if (y < contentStart || y + height > contentEnd || !isFree(y, height)) continue;

      if (kind === 'jet') {
        const direction = random() < 0.5 ? 1 : -1;
        spawns.push({
          kind,
          y,
          x: direction === 1 ? -width : SCREEN_WIDTH,
          direction,
          speed: difficulty.speeds.jet,
          patrolMin: -width,
          patrolMax: SCREEN_WIDTH,
        });
      } else {
        const lanes = lanesFor(rows, sectionStart, y, height, width + 2 * LANE_MARGIN);
        if (lanes.length === 0) continue;
        const [laneStart, laneEnd] = pickWeighted(
          random,
          lanes.map((lane) => [lane, lane[1] - lane[0]] as const),
        );
        spawns.push({
          kind,
          y,
          x: randomInt(random, laneStart + LANE_MARGIN, laneEnd - width - LANE_MARGIN),
          direction: random() < 0.5 ? 1 : -1,
          speed: kind === 'fuel' ? 0 : difficulty.speeds[kind],
          patrolMin: laneStart + 1,
          patrolMax: laneEnd - width - 1,
        });
      }
      occupied.push([y, y + height]);
      return true;
    }
    return false;
  };

  const span = contentEnd - contentStart;

  // Depots are the lifeline, so they claim their slots before the enemies do.
  for (let i = 0; i < difficulty.fuelDepots; i++) {
    const slotCenter = contentStart + Math.round(((i + 0.5) / difficulty.fuelDepots) * span);
    place('fuel', slotCenter + randomInt(random, -20, 20));
  }

  const spacing = span / difficulty.enemies;
  const jitter = Math.round(spacing / 3);
  for (let i = 0; i < difficulty.enemies; i++) {
    const slotCenter = contentStart + Math.round((i + 0.5) * spacing);
    place(pickWeighted(random, difficulty.enemyMix), slotCenter + randomInt(random, -jitter, jitter));
  }

  return spawns.sort((a, b) => a.y - b.y);
}
