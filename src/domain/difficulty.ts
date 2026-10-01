import type { EnemyKind } from './constants.ts';

export type Terrain = 'light' | 'dark';

export interface Difficulty {
  /** Light-green banks give a plain river; dark-green banks add islands that split it in two. */
  terrain: Terrain;
  minRiverWidth: number;
  maxRiverWidth: number;
  fuelDepots: number;
  enemies: number;
  enemyMix: ReadonlyArray<readonly [EnemyKind, number]>;
  /** Horizontal speed in columns per tick. */
  speeds: Record<EnemyKind, number>;
  /** Narrowest channel on each side of an island. */
  minIslandChannel: number;
}

const FULL_DIFFICULTY_SECTION = 24;

function terrainOf(sectionIndex: number): Terrain {
  if (sectionIndex < 2) return 'light';
  return sectionIndex % 3 === 1 ? 'light' : 'dark';
}

/** Difficulty only depends on how far up the river a section is, so every run meets the same river. */
export function difficultyFor(sectionIndex: number): Difficulty {
  const progress = Math.min(sectionIndex, FULL_DIFFICULTY_SECTION);
  const jetWeight = sectionIndex === 0 ? 0 : Math.min(5, 1 + Math.floor(progress / 3));

  return {
    terrain: terrainOf(sectionIndex),
    minRiverWidth: Math.round(56 - progress * 0.9),
    maxRiverWidth: Math.round(78 - progress * 0.75),
    fuelDepots: sectionIndex < 4 ? 4 : sectionIndex < 10 ? 3 : 2,
    enemies: Math.min(16, 6 + Math.floor(sectionIndex * 0.8)),
    enemyMix: [
      ['tanker', Math.max(1, 5 - Math.floor(progress / 2))],
      ['helicopter', 3 + Math.floor(progress / 6)],
      ['jet', jetWeight],
    ],
    speeds: {
      tanker: Math.min(0.9, 0.45 + 0.02 * progress),
      helicopter: Math.min(1.6, 0.8 + 0.035 * progress),
      jet: Math.min(3, 2.4 + 0.025 * progress),
    },
    minIslandChannel: Math.max(24, 40 - Math.floor(progress / 2)),
  };
}
