import { PLAYER_HEIGHT, PLAYER_SHAPE } from './constants.ts';
import type { Rect } from './types.ts';
import type { World } from './world.ts';

/** Where the jet is: its nose row and left column. */
export interface Pose {
  noseRow: number;
  x: number;
}

interface Span {
  /** First occupied column, relative to the jet's left edge. */
  start: number;
  /** One past the last occupied column. */
  end: number;
}

/** The jet is tested row by row against the outer edges of its silhouette, as the original hardware did per scanline. */
const PLAYER_ROW_SPANS: readonly Span[] = PLAYER_SHAPE.map((row) => ({
  start: row.indexOf('#'),
  end: row.lastIndexOf('#') + 1,
}));

export function touchesTerrain(world: World, pose: Pose): boolean {
  for (let i = 0; i < PLAYER_HEIGHT; i++) {
    const row = world.rowAt(pose.noseRow - i);
    const left = pose.x + PLAYER_ROW_SPANS[i]!.start;
    const right = pose.x + PLAYER_ROW_SPANS[i]!.end;
    if (left < row.left || right > row.right) return true;
    if (row.islandRight > row.islandLeft && right > row.islandLeft && left < row.islandRight) return true;
  }
  return false;
}

export function touchesIntactBridge(world: World, pose: Pose, destroyedBridges: ReadonlySet<number>): boolean {
  for (let i = 0; i < PLAYER_HEIGHT; i++) {
    const section = world.bridgeSectionAt(pose.noseRow - i);
    if (section !== null && !destroyedBridges.has(section)) return true;
  }
  return false;
}

export function overlapsJet(pose: Pose, rect: Rect): boolean {
  for (let i = 0; i < PLAYER_HEIGHT; i++) {
    const row = pose.noseRow - i;
    if (row < rect.y || row >= rect.y + rect.height) continue;
    const span = PLAYER_ROW_SPANS[i]!;
    if (pose.x + span.start < rect.x + rect.width && pose.x + span.end > rect.x) return true;
  }
  return false;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
