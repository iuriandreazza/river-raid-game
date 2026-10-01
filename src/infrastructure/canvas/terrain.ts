import { BRIDGE_HEIGHT, PLAYFIELD_HEIGHT, SCREEN_WIDTH } from '../../domain/constants.ts';
import type { GameState } from '../../domain/types.ts';
import { worldRowAt } from '../../domain/view.ts';
import type { RiverRow } from '../../domain/river.ts';
import { COLORS } from './palette.ts';

interface BridgePalette {
  rail: string;
  deck: string;
  stripe: string;
  shadow: string;
}

const BRIDGE_RAIL_ROWS = 2;
const BRIDGE_STRIPE_FIRST_ROW = 10;
const BRIDGE_STRIPE_ROWS = 2;
const BRIDGE_SHADOW_ROWS = 4;

/** Colors of one scanline of a bridge, counted from its top edge. */
function bridgeRowColor(palette: BridgePalette, rowFromTop: number): string {
  if (rowFromTop < BRIDGE_RAIL_ROWS) return palette.rail;
  if (rowFromTop >= BRIDGE_STRIPE_FIRST_ROW && rowFromTop < BRIDGE_STRIPE_FIRST_ROW + BRIDGE_STRIPE_ROWS) return palette.stripe;
  if (rowFromTop >= BRIDGE_HEIGHT - BRIDGE_SHADOW_ROWS) return palette.shadow;
  return palette.deck;
}

export function drawTerrain(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { world, scroll } = state;
  for (let screenRow = 0; screenRow < PLAYFIELD_HEIGHT; screenRow++) {
    const worldRow = worldRowAt(scroll, screenRow);
    const river = world.rowAt(worldRow);
    const land = world.terrainAt(worldRow) === 'light' ? COLORS.landLight : COLORS.landDark;

    ctx.fillStyle = land;
    ctx.fillRect(0, screenRow, SCREEN_WIDTH, 1);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(river.left, screenRow, river.right - river.left, 1);
    if (river.islandRight > river.islandLeft) {
      ctx.fillStyle = land;
      ctx.fillRect(river.islandLeft, screenRow, river.islandRight - river.islandLeft, 1);
    }

    const bridge = world.bridgeSectionAt(worldRow);
    if (bridge !== null) {
      const rowFromTop = BRIDGE_HEIGHT - 1 - (worldRow - world.bridgeBottom(bridge));
      drawBridgeRow(ctx, screenRow, rowFromTop, river, !state.destroyedBridges.has(bridge));
    }
  }
}

function drawBridgeRow(
  ctx: CanvasRenderingContext2D,
  screenRow: number,
  rowFromTop: number,
  river: RiverRow,
  intact: boolean,
): void {
  ctx.fillStyle = bridgeRowColor(COLORS.bridgeLand, rowFromTop);
  ctx.fillRect(0, screenRow, river.left, 1);
  ctx.fillRect(river.right, screenRow, SCREEN_WIDTH - river.right, 1);
  if (intact) {
    ctx.fillStyle = bridgeRowColor(COLORS.bridgeWater, rowFromTop);
    ctx.fillRect(river.left, screenRow, river.right - river.left, 1);
  }
}
