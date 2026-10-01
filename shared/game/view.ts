import { PLAYER_NOSE_ROW } from './constants.ts';

/** World row of the jet's nose: the whole simulation snaps to whole rows, like the original scanlines. */
export function noseRowOf(scroll: number): number {
  return Math.floor(scroll);
}

/** Screen row (0 = top of the playfield) that shows `worldRow`. */
export function screenRowOf(scroll: number, worldRow: number): number {
  return noseRowOf(scroll) + PLAYER_NOSE_ROW - worldRow;
}

/** World row shown at the given screen row. */
export function worldRowAt(scroll: number, screenRow: number): number {
  return noseRowOf(scroll) + PLAYER_NOSE_ROW - screenRow;
}

/** Column the jet occupies: it moves in fractions of a column, but is drawn and tested on whole ones. */
export function jetColumn(playerX: number): number {
  return Math.floor(playerX);
}
