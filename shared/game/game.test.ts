import { describe, expect, it } from 'vitest';
import {
  BRIDGE_HEIGHT,
  DEATH_TICKS,
  EXTRA_JET_EVERY,
  FUEL_DRAIN_PER_TICK,
  LATERAL_RAMP_TICKS,
  LATERAL_SPEED,
  MAX_DISPLAYED_SCORE,
  MAX_RESERVE_JETS,
  OBJECT_SIZES,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  POINTS,
  REFUEL_PER_TICK,
  SCREEN_WIDTH,
  SECTION_LENGTH,
  STARTING_RESERVE_JETS,
  type EnemyKind,
} from './constants.ts';
import { advance, createGame, effectiveInput } from './game.ts';
import type { RiverRow } from './river.ts';
import { NO_INPUT, type Enemy, type GameEvent, type GameState, type Input } from './types.ts';
import { noseRowOf } from './view.ts';
import { World, type SectionPlan } from './world.ts';

/** A wide, empty river: lets each rule be tested without terrain or random objects in the way. */
class OpenRiver extends World {
  override rowAt(): RiverRow {
    return { left: 8, right: SCREEN_WIDTH - 8, islandLeft: 0, islandRight: 0 };
  }

  override plan(index: number): SectionPlan {
    return { index, terrain: 'light', startRow: this.sectionStart(index), rows: [], spawns: [] };
  }
}

/** The same wide river with an island in the middle, where the jet starts. */
class RiverWithIsland extends OpenRiver {
  override rowAt(): RiverRow {
    return { left: 8, right: SCREEN_WIDTH - 8, islandLeft: 70, islandRight: 90 };
  }
}

const input = (overrides: Partial<Input> = {}): Input => ({ ...NO_INPUT, ...overrides });

function run(state: GameState, ticks: number, held: Input = NO_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...advance(state, held));
  return events;
}

function openGame(): GameState {
  return createGame(new OpenRiver());
}

function enemyAhead(state: GameState, kind: EnemyKind, rowsAhead: number, overrides: Partial<Enemy> = {}): Enemy {
  const { width, height } = OBJECT_SIZES[kind];
  const enemy: Enemy = {
    kind,
    x: state.playerX + 4 - width / 2,
    y: noseRowOf(state.scroll) + rowsAhead,
    width,
    height,
    vx: 0,
    patrolMin: 0,
    patrolMax: SCREEN_WIDTH - width,
    active: true,
    ...overrides,
  };
  state.enemies.push(enemy);
  return enemy;
}

function crashJet(state: GameState): GameEvent[] {
  state.playerX = 0;
  return run(state, 1);
}

/** Presses the button for one tick and lets the single missile fly. */
function shootOnce(state: GameState, ticks = 25): GameEvent[] {
  return [...run(state, 1, input({ fire: true })), ...run(state, ticks)];
}

describe('effective controls', () => {
  const everything = input({ left: true, up: true, fire: true });

  it('are all the controls that the engine listens to while the jet flies', () => {
    expect(effectiveInput(openGame(), everything)).toEqual(everything);
  });

  it('leave out directions that cancel each other', () => {
    const state = openGame();
    expect(effectiveInput(state, input({ left: true, right: true, up: true, down: true }))).toEqual(NO_INPUT);
    expect(effectiveInput(state, input({ right: true, down: true }))).toEqual(input({ right: true, down: true }));
  });

  it('leave out the fire button while a missile is in the air', () => {
    const state = openGame();
    state.missile = { x: 80, y: 10 };
    expect(effectiveInput(state, everything)).toEqual(input({ left: true, up: true }));
  });

  it.each(['dying', 'gameOver'] as const)('leave out everything while the game is %s', (phase) => {
    const state = openGame();
    state.phase = phase;
    expect(effectiveInput(state, everything)).toEqual(NO_INPUT);
  });
});

describe('a new game', () => {
  it('starts mid-river with a full tank, the spare jets and no points', () => {
    const state = createGame();
    expect(state.phase).toBe('playing');
    expect(state.score).toBe(0);
    expect(state.fuel).toBe(1);
    expect(state.reserveJets).toBe(STARTING_RESERVE_JETS);
    expect(state.playerX).toBe(76);
  });
});

describe('flying', () => {
  it('scrolls at the speed picked with up and down', () => {
    const normal = openGame();
    run(normal, 60);
    expect(normal.scroll).toBeCloseTo(60);

    const fast = openGame();
    run(fast, 60, input({ up: true }));
    expect(fast.scroll).toBeCloseTo(90);

    const slow = openGame();
    run(slow, 60, input({ down: true }));
    expect(slow.scroll).toBeCloseTo(30);
  });

  it('steers sideways and stays on screen', () => {
    const state = openGame();
    run(state, 4, input({ left: true }));
    expect(state.playerX).toBe(76 - 4 * LATERAL_SPEED.start);
    run(state, 4, input({ right: true }));
    expect(state.playerX).toBe(76);

    state.playerX = 0.25;
    advance(state, input({ left: true }));
    expect(state.playerX).toBe(0);
  });

  it('starts sideways slowly and reaches full speed after holding the direction for a moment', () => {
    const state = openGame();
    const start = state.playerX;

    run(state, LATERAL_RAMP_TICKS, input({ right: true }));
    expect(state.playerX - start).toBeCloseTo(LATERAL_RAMP_TICKS * LATERAL_SPEED.start);

    run(state, 10, input({ right: true }));
    expect(state.playerX - start).toBeCloseTo(LATERAL_RAMP_TICKS * LATERAL_SPEED.start + 10 * LATERAL_SPEED.full);
  });

  it('starts the sideways ramp over when the direction changes or the stick is released', () => {
    const state = openGame();
    run(state, LATERAL_RAMP_TICKS + 5, input({ right: true }));

    const beforeReversing = state.playerX;
    run(state, 1, input({ left: true }));
    expect(state.playerX).toBe(beforeReversing - LATERAL_SPEED.start);

    run(state, LATERAL_RAMP_TICKS + 5, input({ left: true }));
    run(state, 1, NO_INPUT);
    const beforeTapping = state.playerX;
    run(state, 1, input({ left: true }));
    expect(state.playerX).toBe(beforeTapping - LATERAL_SPEED.start);
  });

  it('moves sideways at the same speed whatever the scroll speed', () => {
    const slow = openGame();
    const fast = openGame();
    run(slow, 30, input({ right: true, down: true }));
    run(fast, 30, input({ right: true, up: true }));
    expect(slow.playerX).toBe(fast.playerX);
  });
});

describe('fuel', () => {
  it('drains at a constant rate whatever the speed', () => {
    const slow = openGame();
    run(slow, 300, input({ down: true }));
    const fast = openGame();
    run(fast, 300, input({ up: true }));
    expect(slow.fuel).toBeCloseTo(1 - 300 * FUEL_DRAIN_PER_TICK);
    expect(fast.fuel).toBeCloseTo(slow.fuel);
  });

  it('refills while the jet is over a depot, and only up to full', () => {
    const state = openGame();
    state.fuel = 0.5;
    const { width, height } = OBJECT_SIZES.fuel;
    state.depots.push({ x: state.playerX, y: noseRowOf(state.scroll) - 4, width, height });

    advance(state, NO_INPUT);
    expect(state.refueling).toBe(true);
    expect(state.fuel).toBeCloseTo(0.5 + REFUEL_PER_TICK - FUEL_DRAIN_PER_TICK);

    state.fuel = 0.999;
    advance(state, NO_INPUT);
    expect(state.fuel).toBe(1);
  });

  it('destroys the jet when the tank runs dry', () => {
    const state = openGame();
    state.fuel = FUEL_DRAIN_PER_TICK / 2;
    const events = run(state, 1);
    expect(events).toContainEqual({ type: 'jetLost', cause: 'fuel' });
    expect(state.phase).toBe('dying');
  });
});

describe('crashing', () => {
  it('loses the jet against the river bank, then restarts the section with a full tank', () => {
    const state = openGame();
    run(state, 30);
    state.fuel = 0.4;

    expect(crashJet(state)).toContainEqual({ type: 'jetLost', cause: 'terrain' });
    expect(state.phase).toBe('dying');

    const events = run(state, DEATH_TICKS);
    expect(events).toContainEqual({ type: 'respawned' });
    expect(state.phase).toBe('playing');
    expect(state.reserveJets).toBe(STARTING_RESERVE_JETS - 1);
    expect(state.fuel).toBe(1);
    expect(state.scroll).toBe(0);
    expect(state.playerX).toBe(76);
  });

  it('forgets nothing about the section: enemies come back after a restart', () => {
    const state = createGame();
    run(state, 400);
    const before = state.enemies.length + state.depots.length;
    expect(before).toBeGreaterThan(0);

    crashJet(state);
    run(state, DEATH_TICKS);
    expect(state.enemies).toHaveLength(0);
    run(state, 400);
    expect(state.enemies.length + state.depots.length).toBe(before);
  });

  it.each([
    { playerX: 8, crashes: false },
    { playerX: 7, crashes: true },
    { playerX: SCREEN_WIDTH - 8 - PLAYER_WIDTH, crashes: false },
    { playerX: SCREEN_WIDTH - 8 - PLAYER_WIDTH + 1, crashes: true },
  ])('crashes against a bank only when overlapping it: jet at column $playerX -> $crashes', ({ playerX, crashes }) => {
    const state = openGame();
    state.playerX = playerX;
    run(state, 1);
    expect(state.phase).toBe(crashes ? 'dying' : 'playing');
  });

  it('loses the jet against an island', () => {
    const state = createGame(new RiverWithIsland());
    expect(run(state, 1)).toContainEqual({ type: 'jetLost', cause: 'terrain' });
  });

  it('plays on with the last spare jet and ends the game with the next crash', () => {
    const state = openGame();
    state.reserveJets = 1;

    crashJet(state);
    expect(run(state, DEATH_TICKS)).toContainEqual({ type: 'respawned' });
    expect(state.reserveJets).toBe(0);

    crashJet(state);
    expect(run(state, DEATH_TICKS)).toContainEqual({ type: 'gameOver' });
  });

  it('ends the game when the last jet is lost', () => {
    const state = openGame();
    state.reserveJets = 0;
    crashJet(state);
    const events = run(state, DEATH_TICKS);
    expect(events).toContainEqual({ type: 'gameOver' });
    expect(state.phase).toBe('gameOver');
    expect(run(state, 10)).toEqual([]);
  });

  it('loses the jet when it touches an enemy', () => {
    const state = openGame();
    enemyAhead(state, 'helicopter', 0);
    expect(run(state, 1)).toContainEqual({ type: 'jetLost', cause: 'enemy' });
  });

  it('stops scrolling the world while the jet is dying', () => {
    const state = openGame();
    crashJet(state);
    const scroll = state.scroll;
    run(state, 30, input({ up: true }));
    expect(state.scroll).toBe(scroll);
  });
});

describe('the missile', () => {
  it('flies one at a time, even with the button held down', () => {
    const state = openGame();
    const events = run(state, 5, input({ fire: true }));
    expect(events.filter((event) => event.type === 'missileFired')).toHaveLength(1);
    expect(state.missile).not.toBeNull();
  });

  it('can be fired again once the previous one left the screen', () => {
    const state = openGame();
    const events = run(state, 80, input({ fire: true }));
    expect(events.filter((event) => event.type === 'missileFired').length).toBeGreaterThan(1);
  });

  it.each<[EnemyKind, number]>([
    ['tanker', POINTS.tanker],
    ['helicopter', POINTS.helicopter],
    ['jet', POINTS.jet],
  ])('scores %s for %i points', (kind, points) => {
    const state = openGame();
    const enemy = enemyAhead(state, kind, 40);
    const events = shootOnce(state);
    expect(events).toContainEqual({ type: 'objectDestroyed', kind, points });
    expect(state.enemies).not.toContain(enemy);
    expect(state.score).toBe(points);
    expect(state.missile).toBeNull();
    expect(state.explosions.length).toBeGreaterThan(0);
  });

  it('scores a fuel depot for 80 points and denies the refuel', () => {
    const state = openGame();
    const { width, height } = OBJECT_SIZES.fuel;
    state.depots.push({ x: state.playerX, y: noseRowOf(state.scroll) + 40, width, height });
    const events = shootOnce(state);
    expect(events).toContainEqual({ type: 'objectDestroyed', kind: 'fuel', points: POINTS.fuel });
    expect(state.depots).toHaveLength(0);
  });

  it('hits only the nearest object in its path', () => {
    const state = openGame();
    const far = enemyAhead(state, 'tanker', 90);
    const near = enemyAhead(state, 'helicopter', 40);
    shootOnce(state);
    expect(state.enemies).not.toContain(near);
    expect(state.enemies).toContain(far);
  });
});

describe('bridges', () => {
  function approachBridge(state: GameState): void {
    state.scroll = state.world.bridgeBottom(0) - 70;
    state.spawnCursor = state.scroll;
  }

  it('is worth 500 points when blown up from afar', () => {
    const state = openGame();
    approachBridge(state);
    const events = shootOnce(state);
    expect(events).toContainEqual({ type: 'bridgeDestroyed' });
    expect(state.destroyedBridges.has(0)).toBe(true);
    expect(state.score).toBe(POINTS.bridge);
  });

  describe('when the missile is between two rows', () => {
    // The real river is needed: it is the water of the bridge, not the wide-open test river, that decides a hit.
    function missileInsideBridge(x: number): GameState {
      const state = createGame();
      state.scroll = state.world.bridgeBottom(0) - 100;
      state.spawnCursor = state.scroll;
      const water = state.world.rowAt(noseRowOf(state.scroll));
      state.playerX = Math.floor((water.left + water.right - PLAYER_WIDTH) / 2);
      state.missile = { x, y: state.world.bridgeBottom(0) + 2.5 };
      return state;
    }

    it('blows up the bridge when the missile is over the water', () => {
      const state = missileInsideBridge(SCREEN_WIDTH / 2);
      expect(run(state, 1, input({ up: true }))).toContainEqual({ type: 'bridgeDestroyed' });
    });

    it('keeps flying over the road on the bank, which is solid', () => {
      const state = missileInsideBridge(4);
      expect(run(state, 1, input({ up: true }))).toEqual([]);
      expect(state.missile).not.toBeNull();
      expect(state.destroyedBridges.size).toBe(0);
    });
  });

  it('kills the jet when it flies into an intact bridge', () => {
    const state = openGame();
    approachBridge(state);
    const events = run(state, 100);
    expect(events).toContainEqual({ type: 'jetLost', cause: 'bridge' });
  });

  it('lets the jet through once the bridge is down', () => {
    const state = openGame();
    approachBridge(state);
    state.destroyedBridges.add(0);
    run(state, 150);
    expect(state.phase).toBe('playing');
    expect(state.scroll).toBeGreaterThan(SECTION_LENGTH);
  });

  it('restarts after a crash at the start of the section, unless its bridge is down', () => {
    const intact = openGame();
    intact.scroll = SECTION_LENGTH + 200;
    crashJet(intact);
    run(intact, DEATH_TICKS);
    expect(intact.scroll).toBe(SECTION_LENGTH);

    const destroyed = openGame();
    destroyed.scroll = destroyed.world.bridgeBottom(0) - 10;
    destroyed.destroyedBridges.add(0);
    crashJet(destroyed);
    run(destroyed, DEATH_TICKS);
    expect(destroyed.scroll).toBe(SECTION_LENGTH);
  });

  it('is cleared of the bridge rows below a restarted jet', () => {
    const state = openGame();
    state.scroll = SECTION_LENGTH + 5;
    state.destroyedBridges.add(0);
    crashJet(state);
    run(state, DEATH_TICKS);
    expect(noseRowOf(state.scroll) - PLAYER_HEIGHT).toBeLessThan(state.world.bridgeBottom(0) + BRIDGE_HEIGHT);
    expect(run(state, 5)).toEqual([]);
    expect(state.phase).toBe('playing');
  });
});

describe('score and spare jets', () => {
  function destroyTanker(state: GameState): GameEvent[] {
    enemyAhead(state, 'tanker', 40);
    return shootOnce(state);
  }

  it('pays what the original game paid for every target', () => {
    expect(POINTS).toEqual({ tanker: 30, helicopter: 60, fuel: 80, jet: 100, bridge: 500 });
  });

  it('awards a spare jet for every 10,000 points', () => {
    const state = openGame();
    state.score = EXTRA_JET_EVERY - POINTS.tanker;
    const events = destroyTanker(state);
    expect(events).toContainEqual({ type: 'extraJet' });
    expect(state.reserveJets).toBe(STARTING_RESERVE_JETS + 1);

    state.enemies = [];
    destroyTanker(state);
    expect(state.reserveJets).toBe(STARTING_RESERVE_JETS + 1);
  });

  it('never holds more than nine spare jets', () => {
    const state = openGame();
    state.reserveJets = MAX_RESERVE_JETS;
    state.score = EXTRA_JET_EVERY - POINTS.tanker;
    destroyTanker(state);
    expect(state.reserveJets).toBe(MAX_RESERVE_JETS);
  });

  it('stops counting at the last digit of the display', () => {
    const state = openGame();
    state.score = MAX_DISPLAYED_SCORE - 10;
    destroyTanker(state);
    expect(state.score).toBe(MAX_DISPLAYED_SCORE);
  });
});

describe('enemies', () => {
  it('patrol between the banks and turn around at the edges', () => {
    const state = openGame();
    const tanker = enemyAhead(state, 'tanker', 100, { x: 30, vx: 0.5, patrolMin: 20, patrolMax: 40 });
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      advance(state, NO_INPUT);
      if (state.phase !== 'playing') break;
      seen.add(Math.sign(tanker.vx));
      expect(tanker.x).toBeGreaterThanOrEqual(20);
      expect(tanker.x).toBeLessThanOrEqual(40);
    }
    expect(seen).toEqual(new Set([1, -1]));
  });

  it('send jets across the whole screen once the player gets close, then forget them', () => {
    const state = openGame();
    const { width } = OBJECT_SIZES.jet;
    const jet = enemyAhead(state, 'jet', 200, { x: -width, vx: 1, active: false });

    run(state, 100);
    expect(jet.active).toBe(false);
    expect(jet.x).toBe(-width);

    run(state, 20);
    expect(jet.active).toBe(true);
    run(state, 250);
    expect(state.enemies).not.toContain(jet);
  });

  it('time their pass so that a jet crosses the middle of the river as the player flies by at normal speed', () => {
    const state = openGame();
    const { width } = OBJECT_SIZES.jet;
    const jet = enemyAhead(state, 'jet', 300, { x: -width, vx: 1.5, active: false });

    while (noseRowOf(state.scroll) < jet.y) run(state, 1);

    const jetMiddle = jet.x + width / 2;
    expect(Math.abs(jetMiddle - SCREEN_WIDTH / 2)).toBeLessThan(3);
  });

  it('are created as the river scrolls into view', () => {
    const state = createGame();
    expect(state.enemies).toHaveLength(0);
    run(state, 200);
    expect(state.enemies.length + state.depots.length).toBeGreaterThan(0);
  });
});
