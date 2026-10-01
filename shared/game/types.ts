import type { EnemyKind, ObjectKind } from './constants.ts';
import type { World } from './world.ts';

export type Phase = 'playing' | 'dying' | 'gameOver';
export type SpeedLevel = 'slow' | 'normal' | 'fast';
export type CrashCause = 'terrain' | 'bridge' | 'enemy' | 'fuel';

export interface Input {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
}

export const NO_INPUT: Readonly<Input> = { left: false, right: false, up: false, down: false, fire: false };

/** Axis-aligned box in world coordinates; `y` is the lowest row and rows grow upstream. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Enemy extends Rect {
  kind: EnemyKind;
  /** Columns per tick, signed. */
  vx: number;
  patrolMin: number;
  patrolMax: number;
  /** Jets wait off screen until the player gets close; patrolling enemies are always active. */
  active: boolean;
}

export type FuelDepot = Rect;

export interface Missile {
  x: number;
  /** Lowest world row of the missile. */
  y: number;
}

export type ExplosionKind = 'small' | 'plane' | 'bridge';

export interface Explosion {
  kind: ExplosionKind;
  /** Horizontal center, in columns. */
  x: number;
  /** World row of the vertical center. */
  y: number;
  age: number;
}

export type GameEvent =
  | { type: 'missileFired' }
  | { type: 'objectDestroyed'; kind: ObjectKind; points: number }
  | { type: 'bridgeDestroyed' }
  | { type: 'jetLost'; cause: CrashCause }
  | { type: 'extraJet' }
  | { type: 'respawned' }
  | { type: 'gameOver' };

export interface GameState {
  phase: Phase;
  tick: number;
  score: number;
  /** Spare jets shown on the dashboard; the jet in play is not counted. */
  reserveJets: number;
  /** 0 (empty) to 1 (full). */
  fuel: number;
  refueling: boolean;
  speedLevel: SpeedLevel;
  /** World row of the jet's nose. It grows as the jet flies upstream. */
  scroll: number;
  /** Left edge of the jet; fractional while it moves at half speed. See `jetColumn`. */
  playerX: number;
  /** Direction the jet is steering in, and for how many ticks it has been held. */
  heading: -1 | 0 | 1;
  headingTicks: number;
  missile: Missile | null;
  enemies: Enemy[];
  depots: FuelDepot[];
  explosions: Explosion[];
  /** Sections whose bridge has been blown up. */
  destroyedBridges: Set<number>;
  nextExtraJetAt: number;
  /** World rows below this one have already been scanned for objects to spawn. */
  spawnCursor: number;
  /** Ticks left before the next jet appears (or the game ends) while dying. */
  deathTicksLeft: number;
  world: World;
}
