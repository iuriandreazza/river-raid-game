/**
 * Game rules expressed in the Atari-like logical resolution: 160 px wide, one "row" = one scanline.
 * The simulation runs at a fixed 60 ticks per second, so every speed is "per tick".
 */

export const TICKS_PER_SECOND = 60;

// Screen layout
export const SCREEN_WIDTH = 160;
export const PLAYFIELD_HEIGHT = 160;
export const DASHBOARD_HEIGHT = 32;
export const SCREEN_HEIGHT = PLAYFIELD_HEIGHT + DASHBOARD_HEIGHT;

// World layout: the river is cut into sections, each one closed by a bridge.
export const SECTION_LENGTH = 1050;
export const BRIDGE_HEIGHT = 24;
/** Width of the water channel that runs through every bridge. */
export const BRIDGE_CHANNEL_WIDTH = 32;
export const WORLD_SEED = 0x52495652;

// Terrain limits that keep every generated river navigable.
export const MIN_BANK_WIDTH = 8;
export const MIN_CHANNEL_WIDTH = 22;
export const BANK_SLOPE = 1;

// Player
export const PLAYER_WIDTH = 8;
export const PLAYER_HEIGHT = 10;
/** Screen row (inside the playfield) where the jet's nose is drawn. */
export const PLAYER_NOSE_ROW = 143;
export const PLAYER_SPEED_X = 2;

/** Silhouette of the jet, nose first. It is both the hitbox and the base of the sprite. */
export const PLAYER_SHAPE: readonly string[] = [
  '...##...',
  '...##...',
  '..####..',
  '..####..',
  '.######.',
  '########',
  '##.##.##',
  '...##...',
  '..####..',
  '..#..#..',
];

export const SCROLL_SPEEDS = { slow: 0.5, normal: 1, fast: 1.5 } as const;

// Missile: one at a time, constant speed on screen.
export const MISSILE_WIDTH = 2;
export const MISSILE_HEIGHT = 6;
export const MISSILE_SCREEN_SPEED = 6;

// Fuel (1 = full tank)
export const FUEL_DRAIN_PER_TICK = 1 / 3200;
export const REFUEL_PER_TICK = 0.006;
export const LOW_FUEL_THRESHOLD = 0.25;

// Lives and scoring
export const STARTING_RESERVE_JETS = 3;
export const MAX_RESERVE_JETS = 9;
export const EXTRA_JET_EVERY = 10_000;
export const MAX_DISPLAYED_SCORE = 999_999;

export const POINTS = { tanker: 30, helicopter: 60, fuel: 80, jet: 100, bridge: 500 } as const;

export type EnemyKind = 'tanker' | 'helicopter' | 'jet';
export type ObjectKind = EnemyKind | 'fuel';

export const OBJECT_SIZES: Record<ObjectKind, { width: number; height: number }> = {
  tanker: { width: 14, height: 7 },
  helicopter: { width: 9, height: 10 },
  jet: { width: 9, height: 6 },
  fuel: { width: 8, height: 24 },
};

/** A jet starts its pass when it is this many rows ahead of the player's nose. */
export const JET_TRIGGER_ROWS = 60;

// Timings (ticks)
export const DEATH_TICKS = 100;
export const EXPLOSION_TICKS = { small: 22, plane: 70, bridge: 50 } as const;
