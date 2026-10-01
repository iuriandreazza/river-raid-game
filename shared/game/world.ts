import { BRIDGE_HEIGHT, SECTION_LENGTH, WORLD_SEED } from './constants.ts';
import { difficultyFor, type Terrain } from './difficulty.ts';
import { combineSeeds, createRandom } from './random.ts';
import { generateRiverRows, type RiverRow } from './river.ts';
import { generateSpawns, type Spawn } from './spawns.ts';

export interface SectionPlan {
  index: number;
  terrain: Terrain;
  /** Absolute world row of the section's lowest row. */
  startRow: number;
  rows: readonly RiverRow[];
  spawns: readonly Spawn[];
}

/**
 * The whole river, built lazily section by section. It is a pure function of the section index,
 * so every run (and every respawn) meets exactly the same river, like the original game.
 */
export class World {
  private readonly plans = new Map<number, SectionPlan>();

  sectionIndexAt(worldRow: number): number {
    return Math.max(0, Math.floor(worldRow / SECTION_LENGTH));
  }

  sectionStart(index: number): number {
    return index * SECTION_LENGTH;
  }

  bridgeBottom(index: number): number {
    return (index + 1) * SECTION_LENGTH - BRIDGE_HEIGHT;
  }

  plan(index: number): SectionPlan {
    let plan = this.plans.get(index);
    if (!plan) {
      plan = this.buildPlan(index);
      this.plans.set(index, plan);
    }
    return plan;
  }

  /** Rows below the start of the river reuse the first row, so the view is never empty. */
  rowAt(worldRow: number): RiverRow {
    const row = Math.max(0, worldRow);
    const plan = this.plan(this.sectionIndexAt(row));
    return plan.rows[row - plan.startRow]!;
  }

  terrainAt(worldRow: number): Terrain {
    return this.plan(this.sectionIndexAt(worldRow)).terrain;
  }

  /** Index of the section whose bridge covers the row, or null when the row is not part of a bridge. */
  bridgeSectionAt(worldRow: number): number | null {
    const index = this.sectionIndexAt(worldRow);
    const bottom = this.bridgeBottom(index);
    return worldRow >= bottom && worldRow < bottom + BRIDGE_HEIGHT ? index : null;
  }

  private buildPlan(index: number): SectionPlan {
    const difficulty = difficultyFor(index);
    const startRow = this.sectionStart(index);
    const rows = generateRiverRows(index, difficulty);
    const spawns = generateSpawns(startRow, rows, createRandom(combineSeeds(WORLD_SEED ^ 0x5eed, index)), difficulty);
    return { index, terrain: difficulty.terrain, startRow, rows, spawns };
  }
}
