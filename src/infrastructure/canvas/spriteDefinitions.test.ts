import { describe, expect, it } from 'vitest';
import { OBJECT_SIZES, PLAYER_HEIGHT, PLAYER_WIDTH } from '../../domain/constants.ts';
import { SPRITES, type SpriteDefinition } from './spriteDefinitions.ts';

function dimensions(sprite: SpriteDefinition): { width: number; height: number } {
  return { width: sprite.rows[0]!.length, height: sprite.rows.length };
}

describe('sprite definitions', () => {
  it.each([
    ['jet', SPRITES.jet, { width: PLAYER_WIDTH, height: PLAYER_HEIGHT }],
    ['fuel depot', SPRITES.fuelDepot, OBJECT_SIZES.fuel],
    ['helicopter frame 1', SPRITES.helicopter[0]!, OBJECT_SIZES.helicopter],
    ['helicopter frame 2', SPRITES.helicopter[1]!, OBJECT_SIZES.helicopter],
    ['tanker', SPRITES.tanker, OBJECT_SIZES.tanker],
    ['enemy jet', SPRITES.enemyJet, OBJECT_SIZES.jet],
  ])('draws the %s as big as its hitbox', (_name, sprite, size) => {
    expect(dimensions(sprite)).toEqual(size);
  });

  it('is rectangular and fully painted', () => {
    const all = [SPRITES.jet, SPRITES.fuelDepot, ...SPRITES.helicopter, SPRITES.tanker, SPRITES.enemyJet];
    for (const sprite of all) {
      for (const row of sprite.rows) {
        expect(row).toHaveLength(sprite.rows[0]!.length);
        for (const pixel of row) if (pixel !== '.') expect(sprite.colors[pixel], `pixel ${pixel}`).toBeDefined();
      }
    }
  });
});
