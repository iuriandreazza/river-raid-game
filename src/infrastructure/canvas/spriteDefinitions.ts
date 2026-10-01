import { PLAYER_SHAPE } from '../../domain/constants.ts';
import { COLORS } from './palette.ts';
import { glyphRows } from './pixelFont.ts';

/** A sprite as text: one character per pixel, `.` is transparent. Enemies are drawn facing right. */
export interface SpriteDefinition {
  rows: readonly string[];
  colors: Readonly<Record<string, string>>;
}

/** Nose and body are yellow, the wings orange, like the jet on the original cartridge. */
const JET_ROW_PAINT = 'YYYYOOOYOO';

const JET: SpriteDefinition = {
  rows: PLAYER_SHAPE.map((row, index) => row.replaceAll('#', JET_ROW_PAINT[index]!)),
  colors: { Y: COLORS.jetYellow, O: COLORS.jetOrange },
};

const FUEL_DEPOT_WIDTH = 9;
const FUEL_DEPOT_HEIGHT = 24;
const FUEL_LETTER_COLUMN = 3;

/** A pink tower with the word FUEL spelled from top to bottom. */
function fuelDepotRows(): string[] {
  const rows: string[][] = Array.from({ length: FUEL_DEPOT_HEIGHT }, () =>
    Array.from({ length: FUEL_DEPOT_WIDTH }, (_, column) => (column === 0 || column === FUEL_DEPOT_WIDTH - 1 ? 'D' : 'P')),
  );
  [...'FUEL'].forEach((letter, index) => {
    glyphRows(letter).forEach((glyphRow, glyphY) => {
      [...glyphRow].forEach((pixel, glyphX) => {
        if (pixel === '#') rows[1 + index * 6 + glyphY]![FUEL_LETTER_COLUMN + glyphX] = 'W';
      });
    });
  });
  return rows.map((row) => row.join(''));
}

const FUEL_DEPOT: SpriteDefinition = {
  rows: fuelDepotRows(),
  colors: { P: COLORS.fuelBody, D: COLORS.fuelEdge, W: COLORS.fuelLetter },
};

const HELICOPTER_COLORS = {
  R: COLORS.rotor,
  M: COLORS.helicopterDark,
  B: COLORS.helicopterBody,
  C: COLORS.helicopterGlass,
  T: COLORS.helicopterDark,
};

const HELICOPTER_FRAMES: readonly SpriteDefinition[] = [
  {
    rows: [
      'RRRRRRRR',
      '...MM...',
      '..BBBB..',
      '.BBCCBB.',
      '.BBCCBB.',
      '.BBBBBB.',
      '..BBBB..',
      '..T..T..',
      '..TTTT..',
      '........',
    ],
    colors: HELICOPTER_COLORS,
  },
  {
    rows: [
      '..RRRR..',
      '...MM...',
      '..BBBB..',
      '.BBCCBB.',
      '.BBCCBB.',
      '.BBBBBB.',
      '..BBBB..',
      '..T..T..',
      '..TTTT..',
      '........',
    ],
    colors: HELICOPTER_COLORS,
  },
];

const TANKER: SpriteDefinition = {
  rows: [
    '.HHHHHHHHHH...',
    'HHHHHHHHHHHHH.',
    'HSSSHDDDDDDDHH',
    'HSSSHDDDDDDDDH',
    'HSSSHDDDDDDDHH',
    'HHHHHHHHHHHHH.',
    '.HHHHHHHHHH...',
  ],
  colors: { H: COLORS.hullDark, D: COLORS.deckGray, S: COLORS.cabinRed },
};

const ENEMY_JET: SpriteDefinition = {
  rows: ['..WW.....', '...WWW...', 'FFFFFFFFF', 'FFFFFFFFF', '...WWW...', '..WW.....'],
  colors: { W: COLORS.enemyJetWing, F: COLORS.enemyJetBody },
};

export const SPRITES = {
  jet: JET,
  fuelDepot: FUEL_DEPOT,
  helicopter: HELICOPTER_FRAMES,
  tanker: TANKER,
  enemyJet: ENEMY_JET,
} as const;
