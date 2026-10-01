import { BRIDGE_CHANNEL_WIDTH, BRIDGE_HEIGHT, EXPLOSION_TICKS } from '../../../shared/game/constants.ts';
import type { Explosion } from '../../../shared/game/types.ts';
import { screenRowOf } from '../../../shared/game/view.ts';
import { COLORS } from './palette.ts';

const MAX_RADIUS = { small: 9, plane: 13 } as const;

/** Pixel disc: one horizontal run per row, which is cheap and keeps the blocky look. */
function fillDisc(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number): void {
  const r = Math.max(0, Math.round(radius));
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(centerX - half, centerY + dy, half * 2 + 1, 1);
  }
}

/** A fireball grows quickly, then burns down from white to embers. */
function drawFireball(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  progress: number,
  maxRadius: number,
  flicker: number,
): void {
  const radius = maxRadius * Math.sin(Math.min(1, progress * 1.4) * (Math.PI / 2)) * (1 - progress * 0.35);
  const layers: Array<[string, number, number]> = [
    [COLORS.explosionEmber, 1, 0],
    [COLORS.explosionRed, 0.85, 0.15],
    [COLORS.explosionOrange, 0.65, 0.3],
    [COLORS.explosionYellow, 0.4, 0.5],
    [COLORS.explosionCore, 0.2, 0.7],
  ];
  for (const [color, size, fadeAt] of layers) {
    if (progress > 0.6 + fadeAt * 0.4) continue;
    ctx.fillStyle = color;
    fillDisc(ctx, centerX, centerY, radius * size + (flicker % 2));
  }
}

function drawBridgeBlast(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, progress: number, flicker: number): void {
  const height = Math.round(BRIDGE_HEIGHT * Math.sin(Math.min(1, progress * 1.6) * (Math.PI / 2)) * (1 - progress * 0.5));
  const width = BRIDGE_CHANNEL_WIDTH + 8;
  const top = Math.round(centerY - height / 2);
  const colors = [COLORS.explosionCore, COLORS.explosionYellow, COLORS.explosionOrange, COLORS.explosionRed];
  for (let band = 0; band < height; band++) {
    ctx.fillStyle = colors[(band + flicker) % colors.length]!;
    ctx.fillRect(centerX - width / 2, top + band, width, 1);
  }
}

export function drawExplosion(ctx: CanvasRenderingContext2D, explosion: Explosion, scroll: number): void {
  const centerX = Math.round(explosion.x);
  const centerY = Math.round(screenRowOf(scroll, explosion.y));
  const progress = explosion.age / EXPLOSION_TICKS[explosion.kind];
  const flicker = Math.floor(explosion.age / 2);

  if (explosion.kind === 'bridge') drawBridgeBlast(ctx, centerX, centerY, progress, flicker);
  else drawFireball(ctx, centerX, centerY, progress, MAX_RADIUS[explosion.kind], flicker);
}
