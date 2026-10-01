import type { RendererPort } from '../../application/ports.ts';
import {
  MISSILE_HEIGHT,
  MISSILE_WIDTH,
  PLAYER_NOSE_ROW,
  PLAYFIELD_HEIGHT,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
} from '../../domain/constants.ts';
import type { Enemy, GameState } from '../../domain/types.ts';
import { jetColumn, screenRowOf } from '../../domain/view.ts';
import { drawDashboard } from './dashboard.ts';
import { drawExplosion } from './explosions.ts';
import { COLORS } from './palette.ts';
import { drawCenteredText } from './pixelFont.ts';
import { SpriteAtlas } from './spriteAtlas.ts';
import { drawTerrain } from './terrain.ts';

/** The rotor flips between two frames this often, in ticks. */
const ROTOR_FRAME_TICKS = 3;

/** Paints the game at its logical 160x192 resolution; CSS scales the canvas up. */
export class CanvasRenderer implements RendererPort {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites = new SpriteAtlas();

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  render(state: GameState): void {
    drawTerrain(this.ctx, state);
    this.drawObjects(state);
    this.drawMissile(state);
    if (state.phase === 'playing') this.drawJet(state);
    for (const explosion of state.explosions) drawExplosion(this.ctx, explosion, state.scroll);
    drawDashboard(this.ctx, state);
    if (state.phase === 'gameOver') this.drawGameOver();
  }

  private drawObjects(state: GameState): void {
    for (const depot of state.depots) {
      this.blit(this.sprites.fuelDepot(), depot.x, screenRowOf(state.scroll, depot.y + depot.height - 1));
    }
    for (const enemy of state.enemies) {
      this.blit(this.spriteFor(enemy, state.tick), enemy.x, screenRowOf(state.scroll, enemy.y + enemy.height - 1));
    }
  }

  private spriteFor(enemy: Enemy, tick: number): HTMLCanvasElement {
    switch (enemy.kind) {
      case 'tanker':
        return this.sprites.tanker(enemy.vx >= 0);
      case 'jet':
        return this.sprites.enemyJet(enemy.vx >= 0);
      case 'helicopter':
        return this.sprites.helicopter(Math.floor(tick / ROTOR_FRAME_TICKS) % 2 === 0 ? 0 : 1);
    }
  }

  private drawMissile(state: GameState): void {
    const { missile } = state;
    if (!missile) return;
    this.ctx.fillStyle = COLORS.missile;
    this.ctx.fillRect(missile.x, screenRowOf(state.scroll, missile.y + MISSILE_HEIGHT - 1), MISSILE_WIDTH, MISSILE_HEIGHT);
  }

  private drawJet(state: GameState): void {
    this.blit(this.sprites.jet(), jetColumn(state.playerX), PLAYER_NOSE_ROW);
  }

  private drawGameOver(): void {
    const y = Math.round(PLAYFIELD_HEIGHT / 2) - 10;
    this.ctx.fillStyle = COLORS.overlay;
    this.ctx.fillRect(0, y - 6, SCREEN_WIDTH, 32);
    drawCenteredText(this.ctx, 'GAME OVER', SCREEN_WIDTH / 2, y, COLORS.hudText, 3);
  }

  private blit(sprite: HTMLCanvasElement, x: number, y: number): void {
    this.ctx.drawImage(sprite, Math.round(x), y);
  }
}
