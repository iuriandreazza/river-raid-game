import { SPRITES, type SpriteDefinition } from './spriteDefinitions.ts';

/** Paints each sprite once on its own tiny canvas, so a frame only has to blit them. */
export class SpriteAtlas {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  jet(): HTMLCanvasElement {
    return this.get('jet', SPRITES.jet, false);
  }

  fuelDepot(): HTMLCanvasElement {
    return this.get('fuel', SPRITES.fuelDepot, false);
  }

  helicopter(frame: 0 | 1): HTMLCanvasElement {
    return this.get(`helicopter-${frame}`, SPRITES.helicopter[frame]!, false);
  }

  tanker(movingRight: boolean): HTMLCanvasElement {
    return this.get(`tanker-${movingRight}`, SPRITES.tanker, !movingRight);
  }

  enemyJet(movingRight: boolean): HTMLCanvasElement {
    return this.get(`jet-${movingRight}`, SPRITES.enemyJet, !movingRight);
  }

  private get(key: string, definition: SpriteDefinition, mirrored: boolean): HTMLCanvasElement {
    let canvas = this.cache.get(key);
    if (!canvas) {
      canvas = paint(definition, mirrored);
      this.cache.set(key, canvas);
    }
    return canvas;
  }
}

function paint(definition: SpriteDefinition, mirrored: boolean): HTMLCanvasElement {
  const width = definition.rows[0]!.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = definition.rows.length;
  const ctx = canvas.getContext('2d')!;
  definition.rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      const color = definition.colors[pixel];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(mirrored ? width - 1 - x : x, y, 1, 1);
    });
  });
  return canvas;
}
