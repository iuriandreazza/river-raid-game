import { overlapsJet, rectsOverlap, touchesIntactBridge, touchesTerrain, type Pose } from './collision.ts';
import {
  BRIDGE_HEIGHT,
  DEATH_TICKS,
  EXPLOSION_TICKS,
  EXTRA_JET_EVERY,
  FUEL_DRAIN_PER_TICK,
  JET_TRIGGER_ROWS,
  MAX_DISPLAYED_SCORE,
  MAX_RESERVE_JETS,
  MISSILE_HEIGHT,
  MISSILE_SCREEN_SPEED,
  MISSILE_WIDTH,
  OBJECT_SIZES,
  PLAYER_HEIGHT,
  PLAYER_NOSE_ROW,
  PLAYER_SHAPE,
  PLAYER_SPEED_X,
  PLAYER_WIDTH,
  PLAYFIELD_HEIGHT,
  POINTS,
  REFUEL_PER_TICK,
  SCREEN_WIDTH,
  SCROLL_SPEEDS,
  STARTING_RESERVE_JETS,
} from './constants.ts';
import type {
  CrashCause,
  Enemy,
  Explosion,
  FuelDepot,
  GameEvent,
  GameState,
  Input,
  Rect,
  SpeedLevel,
} from './types.ts';
import { noseRowOf } from './view.ts';
import { World } from './world.ts';
import type { Spawn } from './spawns.ts';

/** Rows above the top of the screen where objects are created, so they never pop in view. */
const SPAWN_LOOKAHEAD = 20;
/** Rows below the bottom of the screen after which passed objects are forgotten. */
const DISCARD_MARGIN = 4;
const NOSE_COLUMN = PLAYER_SHAPE[0]!.indexOf('#');
const ROWS_BELOW_NOSE_ON_SCREEN = PLAYFIELD_HEIGHT - 1 - PLAYER_NOSE_ROW;

type Target =
  | { type: 'enemy'; enemy: Enemy; contactRow: number }
  | { type: 'depot'; depot: FuelDepot; contactRow: number }
  | { type: 'bridge'; section: number; contactRow: number };

export function createGame(world: World = new World()): GameState {
  const state: GameState = {
    phase: 'playing',
    tick: 0,
    score: 0,
    reserveJets: STARTING_RESERVE_JETS,
    fuel: 1,
    refueling: false,
    speedLevel: 'normal',
    scroll: 0,
    playerX: 0,
    missile: null,
    enemies: [],
    depots: [],
    explosions: [],
    destroyedBridges: new Set(),
    nextExtraJetAt: EXTRA_JET_EVERY,
    spawnCursor: 0,
    deathTicksLeft: 0,
    world,
  };
  startRunAt(state, 0);
  return state;
}

/** Advances the game by one tick. The state is updated in place; what happened is returned as events. */
export function advance(state: GameState, input: Input): GameEvent[] {
  const events: GameEvent[] = [];
  state.tick++;
  ageExplosions(state);
  if (state.phase === 'playing') stepPlaying(state, input, events);
  else if (state.phase === 'dying') stepDying(state, events);
  return events;
}

function stepPlaying(state: GameState, input: Input, events: GameEvent[]): void {
  state.speedLevel = speedLevelFor(input);
  steer(state, input);
  if (input.fire && !state.missile) fireMissile(state, events);

  const scrollSpeed = SCROLL_SPEEDS[state.speedLevel];
  state.scroll += scrollSpeed;
  spawnObjectsInView(state);
  moveEnemies(state);
  if (state.missile) flyMissile(state, scrollSpeed, events);

  const crash = findCrashCause(state);
  if (crash) return loseJet(state, crash, events);

  consumeFuel(state);
  if (state.fuel <= 0) return loseJet(state, 'fuel', events);

  discardGoneObjects(state);
}

function stepDying(state: GameState, events: GameEvent[]): void {
  state.deathTicksLeft--;
  if (state.deathTicksLeft > 0) return;

  if (state.reserveJets === 0) {
    state.phase = 'gameOver';
    events.push({ type: 'gameOver' });
    return;
  }
  state.reserveJets--;
  startRunAt(state, respawnRow(state));
  events.push({ type: 'respawned' });
}

/** Puts a fresh jet, with a full tank, at the start of the river or of a section. */
function startRunAt(state: GameState, row: number): void {
  const water = state.world.rowAt(row);
  state.phase = 'playing';
  state.scroll = row;
  state.playerX = Math.round((water.left + water.right - PLAYER_WIDTH) / 2);
  state.fuel = 1;
  state.refueling = false;
  state.speedLevel = 'normal';
  state.missile = null;
  state.enemies = [];
  state.depots = [];
  state.explosions = [];
  state.spawnCursor = row;
}

/** A crash restarts the section, unless its bridge is already down: then the next section starts. */
function respawnRow(state: GameState): number {
  const { world } = state;
  const section = world.sectionIndexAt(noseRowOf(state.scroll));
  return world.sectionStart(state.destroyedBridges.has(section) ? section + 1 : section);
}

function speedLevelFor(input: Input): SpeedLevel {
  if (input.up && !input.down) return 'fast';
  if (input.down && !input.up) return 'slow';
  return 'normal';
}

function steer(state: GameState, input: Input): void {
  const direction = Number(input.right) - Number(input.left);
  const x = state.playerX + direction * PLAYER_SPEED_X;
  state.playerX = Math.min(SCREEN_WIDTH - PLAYER_WIDTH, Math.max(0, x));
}

function poseOf(state: GameState): Pose {
  return { noseRow: noseRowOf(state.scroll), x: state.playerX };
}

function findCrashCause(state: GameState): CrashCause | null {
  const pose = poseOf(state);
  if (touchesTerrain(state.world, pose)) return 'terrain';
  if (touchesIntactBridge(state.world, pose, state.destroyedBridges)) return 'bridge';
  if (state.enemies.some((enemy) => overlapsJet(pose, enemy))) return 'enemy';
  return null;
}

function loseJet(state: GameState, cause: CrashCause, events: GameEvent[]): void {
  state.phase = 'dying';
  state.deathTicksLeft = DEATH_TICKS;
  state.missile = null;
  state.refueling = false;
  addExplosion(state, 'plane', state.playerX + PLAYER_WIDTH / 2, noseRowOf(state.scroll) - PLAYER_HEIGHT + 1);
  events.push({ type: 'jetLost', cause });
}

function consumeFuel(state: GameState): void {
  const pose = poseOf(state);
  state.refueling = state.depots.some((depot) => overlapsJet(pose, depot));
  const gain = state.refueling ? REFUEL_PER_TICK : 0;
  state.fuel = Math.min(1, Math.max(0, state.fuel + gain - FUEL_DRAIN_PER_TICK));
}

function fireMissile(state: GameState, events: GameEvent[]): void {
  state.missile = { x: state.playerX + NOSE_COLUMN, y: noseRowOf(state.scroll) + 1 };
  events.push({ type: 'missileFired' });
}

function flyMissile(state: GameState, scrollSpeed: number, events: GameEvent[]): void {
  const missile = state.missile!;
  const from = missile.y;
  const to = from + MISSILE_SCREEN_SPEED + scrollSpeed;
  // The missile covers everything between its old and new position in one tick, so fast
  // objects cannot slip through it.
  const sweep: Rect = { x: missile.x, y: from, width: MISSILE_WIDTH, height: to - from + MISSILE_HEIGHT };

  const target = firstTargetHit(state, sweep);
  if (target) {
    state.missile = null;
    destroy(state, target, events);
    return;
  }

  missile.y = to;
  if (missile.y > noseRowOf(state.scroll) + PLAYER_NOSE_ROW) state.missile = null;
}

function firstTargetHit(state: GameState, sweep: Rect): Target | null {
  const candidates: Target[] = [];
  for (const enemy of state.enemies) {
    if (rectsOverlap(sweep, enemy)) candidates.push({ type: 'enemy', enemy, contactRow: Math.max(enemy.y, sweep.y) });
  }
  for (const depot of state.depots) {
    if (rectsOverlap(sweep, depot)) candidates.push({ type: 'depot', depot, contactRow: Math.max(depot.y, sweep.y) });
  }
  const bridge = bridgeHit(state, sweep);
  if (bridge) candidates.push(bridge);

  return candidates.reduce<Target | null>(
    (first, candidate) => (first === null || candidate.contactRow < first.contactRow ? candidate : first),
    null,
  );
}

/** Only the span over the water can be shot; the road over the banks is solid. */
function bridgeHit(state: GameState, sweep: Rect): Target | null {
  const { world } = state;
  const top = sweep.y + sweep.height - 1;
  for (let section = world.sectionIndexAt(sweep.y); section <= world.sectionIndexAt(top); section++) {
    const bottom = world.bridgeBottom(section);
    if (state.destroyedBridges.has(section) || top < bottom || sweep.y >= bottom + BRIDGE_HEIGHT) continue;

    const contactRow = Math.max(bottom, sweep.y);
    const water = world.rowAt(contactRow);
    if (sweep.x + sweep.width > water.left && sweep.x < water.right) return { type: 'bridge', section, contactRow };
  }
  return null;
}

function destroy(state: GameState, target: Target, events: GameEvent[]): void {
  switch (target.type) {
    case 'enemy': {
      const { enemy } = target;
      state.enemies = state.enemies.filter((other) => other !== enemy);
      addExplosion(state, 'small', enemy.x + enemy.width / 2, enemy.y);
      events.push({ type: 'objectDestroyed', kind: enemy.kind, points: POINTS[enemy.kind] });
      award(state, POINTS[enemy.kind], events);
      return;
    }
    case 'depot': {
      const { depot } = target;
      state.depots = state.depots.filter((other) => other !== depot);
      addExplosion(state, 'small', depot.x + depot.width / 2, depot.y);
      events.push({ type: 'objectDestroyed', kind: 'fuel', points: POINTS.fuel });
      award(state, POINTS.fuel, events);
      return;
    }
    case 'bridge': {
      const bottom = state.world.bridgeBottom(target.section);
      const water = state.world.rowAt(bottom);
      state.destroyedBridges.add(target.section);
      addExplosion(state, 'bridge', (water.left + water.right) / 2, bottom);
      events.push({ type: 'bridgeDestroyed' });
      award(state, POINTS.bridge, events);
      return;
    }
  }
}

function award(state: GameState, points: number, events: GameEvent[]): void {
  state.score = Math.min(MAX_DISPLAYED_SCORE, state.score + points);
  while (state.score >= state.nextExtraJetAt) {
    state.nextExtraJetAt += EXTRA_JET_EVERY;
    if (state.reserveJets < MAX_RESERVE_JETS) {
      state.reserveJets++;
      events.push({ type: 'extraJet' });
    }
  }
}

function addExplosion(state: GameState, kind: Explosion['kind'], x: number, y: number): void {
  state.explosions.push({ kind, x, y, age: 0 });
}

function ageExplosions(state: GameState): void {
  for (const explosion of state.explosions) explosion.age++;
  state.explosions = state.explosions.filter((explosion) => explosion.age < EXPLOSION_TICKS[explosion.kind]);
}

function spawnObjectsInView(state: GameState): void {
  const { world } = state;
  const horizon = noseRowOf(state.scroll) + PLAYER_NOSE_ROW + SPAWN_LOOKAHEAD;
  for (let section = world.sectionIndexAt(state.spawnCursor); section <= world.sectionIndexAt(horizon); section++) {
    for (const spawn of world.plan(section).spawns) {
      if (spawn.y >= state.spawnCursor && spawn.y < horizon) addObject(state, spawn);
    }
  }
  state.spawnCursor = horizon;
}

function addObject(state: GameState, spawn: Spawn): void {
  const { width, height } = OBJECT_SIZES[spawn.kind];
  if (spawn.kind === 'fuel') {
    state.depots.push({ x: spawn.x, y: spawn.y, width, height });
    return;
  }
  state.enemies.push({
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    width,
    height,
    vx: spawn.direction * spawn.speed,
    patrolMin: spawn.patrolMin,
    patrolMax: spawn.patrolMax,
    active: spawn.kind !== 'jet',
  });
}

function moveEnemies(state: GameState): void {
  const noseRow = noseRowOf(state.scroll);
  for (const enemy of state.enemies) {
    if (enemy.kind === 'jet') flyJet(enemy, noseRow);
    else patrol(enemy);
  }
}

function flyJet(jet: Enemy, noseRow: number): void {
  if (!jet.active && jet.y - noseRow <= JET_TRIGGER_ROWS) jet.active = true;
  if (jet.active) jet.x += jet.vx;
}

function patrol(enemy: Enemy): void {
  enemy.x += enemy.vx;
  if (enemy.x <= enemy.patrolMin) {
    enemy.x = enemy.patrolMin;
    enemy.vx = Math.abs(enemy.vx);
  } else if (enemy.x >= enemy.patrolMax) {
    enemy.x = enemy.patrolMax;
    enemy.vx = -Math.abs(enemy.vx);
  }
}

function discardGoneObjects(state: GameState): void {
  const bottomRow = noseRowOf(state.scroll) - ROWS_BELOW_NOSE_ON_SCREEN - DISCARD_MARGIN;
  state.enemies = state.enemies.filter((enemy) => enemy.y + enemy.height > bottomRow && !hasCrossedScreen(enemy));
  state.depots = state.depots.filter((depot) => depot.y + depot.height > bottomRow);
}

function hasCrossedScreen(enemy: Enemy): boolean {
  if (enemy.kind !== 'jet' || !enemy.active) return false;
  return enemy.vx > 0 ? enemy.x >= SCREEN_WIDTH : enemy.x + enemy.width <= 0;
}
