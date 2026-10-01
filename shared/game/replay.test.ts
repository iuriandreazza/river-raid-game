import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION,
  MAX_REPLAY_RUNS,
  MAX_REPLAY_TICKS,
  ReplayRecorder,
  decodeInput,
  encodeInput,
  replayProblem,
  replayTicks,
  verifyReplay,
} from './replay.ts';
import { advance, createGame, effectiveInput } from './game.ts';
import { GOLDEN_RUNS, GOLDEN_RUNS_ENGINE_VERSION, GOLDEN_WORLD_DIGEST } from './testing/golden-runs.ts';
import { cautiousPilot, noisyPolicy, recordRun } from './testing/pilot.ts';
import { GOLDEN_WORLD_SECTIONS, worldDigest } from './testing/world-digest.ts';
import { NO_INPUT, type GameState, type Input } from './types.ts';

const input = (overrides: Partial<Input>): Input => ({ ...NO_INPUT, ...overrides });

describe('controls', () => {
  it('survive the trip through a bitmask, in every combination', () => {
    for (let controls = 0; controls < 32; controls++) {
      expect(encodeInput(decodeInput(controls))).toBe(controls);
    }
  });

  it('give every button its own bit', () => {
    const buttons = ['left', 'right', 'up', 'down', 'fire'] as const;
    const bits = buttons.map((button) => encodeInput(input({ [button]: true })));
    expect(new Set(bits).size).toBe(buttons.length);
    expect(bits.every((bit) => Number.isInteger(Math.log2(bit)))).toBe(true);
  });
});

describe('ReplayRecorder', () => {
  it('merges neighbouring ticks that have the same controls', () => {
    const recorder = new ReplayRecorder();
    const left = input({ left: true });
    const fire = input({ fire: true });
    [left, left, left, fire, left].forEach((tick) => recorder.record(tick));

    expect(recorder.replay()).toEqual([encodeInput(left), 3, encodeInput(fire), 1, encodeInput(left), 1]);
  });

  it('hands out copies, so a recording cannot be altered afterwards', () => {
    const recorder = new ReplayRecorder();
    recorder.record(input({ up: true }));
    recorder.replay().push(99, 99);
    expect(recorder.replay()).toHaveLength(2);
  });

  it('counts the ticks it holds', () => {
    expect(replayTicks([1, 5, 0, 3, 16, 2])).toBe(10);
  });
});

describe('replayProblem', () => {
  it.each([
    ['null', null],
    ['text', 'left'],
    ['an object', { 0: 1, 1: 1, length: 2 }],
    ['nothing', []],
    ['an odd number of values', [1, 5, 2]],
    ['a fractional control', [1.5, 5]],
    ['a text control', ['1', 5]],
    ['a negative control', [-1, 5]],
    ['an unknown button', [32, 5]],
    ['a fractional length', [1, 2.5]],
    ['a zero length', [1, 0]],
    ['a negative length', [1, -4]],
    ['a text length', [1, '5']],
    ['neighbouring runs with the same controls', [1, 5, 0, 2, 0, 3]],
    ['a non-finite length', [1, Infinity]],
    ['a run that is too long', [1, MAX_REPLAY_TICKS + 1]],
    ['runs that add up to too long', [1, MAX_REPLAY_TICKS, 2, 1]],
    ['too many runs', Array.from({ length: (MAX_REPLAY_RUNS + 1) * 2 }, () => 1)],
  ])('refuses %s', (_name, value) => {
    expect(replayProblem(value)).toEqual(expect.any(String));
  });

  it.each([
    ['one run', [1, 5]],
    ['several runs', [1, 5, 0, 3, 31, 1]],
    ['the longest run allowed', [0, MAX_REPLAY_TICKS]],
    ['the most runs allowed', Array.from({ length: MAX_REPLAY_RUNS * 2 }, (_, i) => (i % 2 === 0 ? (i / 2) % 2 : 1))],
  ])('accepts %s', (_name, value) => {
    expect(replayProblem(value)).toBeNull();
  });
});

describe('verifyReplay', () => {
  const run = recordRun(cautiousPilot);

  it('arrives at the score of the session that recorded it', () => {
    expect(verifyReplay(run.replay)).toMatchObject({ ok: true, score: run.score, ticks: run.ticks });
    expect(replayTicks(run.replay)).toBe(run.ticks);
  });

  it('is deterministic', () => {
    expect(verifyReplay(run.replay)).toEqual(verifyReplay(run.replay));
  });

  it('refuses a run that stops before the last jet is lost', () => {
    const shortened = [...run.replay];
    shortened[shortened.length - 1]! -= 1;
    expect(verifyReplay(shortened)).toEqual({ ok: false, reason: 'unfinished' });
  });

  it('refuses a run that goes on after the game is over', () => {
    const extended = [...run.replay, 0, 1];
    expect(verifyReplay(extended)).toEqual({ ok: false, reason: 'continued_after_game_over' });
  });

  it('reproduces games played with random controls, which find the odd corners of the rules', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const random = recordRun(noisyPolicy(seed));
      expect(replayProblem(random.replay), `seed ${seed}`).toBeNull();
      expect(verifyReplay(random.replay), `seed ${seed}`).toMatchObject({ ok: true, score: random.score, ticks: random.ticks });
    }
  });

  it('does not reproduce the score when the controls are different', () => {
    const handsOff = run.replay.map((value, index) => (index % 2 === 0 ? 0 : value));
    const verdict = verifyReplay(handsOff);
    expect(verdict.ok && verdict.score === run.score).toBe(false);
  });
});

/** What a player may also be pressing without any effect: the same game, written down differently. */
function withIgnoredControls(policy: (state: GameState, tick: number) => Input, seed: number) {
  let random = seed >>> 0;
  const next = (): number => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const sometimesBoth = (first: boolean, second: boolean): [boolean, boolean] =>
    !first && !second && next() < 0.3 ? [true, true] : [first, second];

  return (state: GameState, tick: number): Input => {
    const wanted = policy(state, tick);
    if (state.phase !== 'playing') {
      return { left: next() < 0.5, right: next() < 0.5, up: next() < 0.5, down: next() < 0.5, fire: next() < 0.5 };
    }
    const [left, right] = sometimesBoth(wanted.left, wanted.right);
    const [up, down] = sometimesBoth(wanted.up, wanted.down);
    return { left, right, up, down, fire: state.missile === null ? wanted.fire : next() < 0.5 };
  };
}

describe('the effective replay of a verdict', () => {
  const verified = (replay: readonly number[]) => {
    const verdict = verifyReplay(replay);
    if (!verdict.ok) throw new Error(`the run should have verified: ${verdict.reason}`);
    return verdict;
  };

  it('is a replay the API would accept, and playing it gives the very same game back', () => {
    const { replay } = recordRun(cautiousPilot);
    const verdict = verified(replay);

    expect(replayProblem(verdict.effective)).toBeNull();
    expect(verifyReplay(verdict.effective)).toEqual(verdict);
  });

  it('is the same for a game written down with controls that the engine ignores', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const plain = recordRun(noisyPolicy(seed));
      const dressedUp = recordRun(withIgnoredControls(noisyPolicy(seed), seed));

      expect(dressedUp.replay, `seed ${seed} was not dressed up`).not.toEqual(plain.replay);
      expect(replayProblem(dressedUp.replay), `seed ${seed}`).toBeNull();
      expect(verified(dressedUp.replay), `seed ${seed}`).toEqual(verified(plain.replay));
    }
  });

  it('is different for a game that differs in a control that matters', () => {
    const { replay } = GOLDEN_RUNS[2]!;
    const [controls, ticks, ...rest] = replay;
    const steeredOnceMore = [encodeInput(input({ left: true })), 1, controls!, ticks! - 1, ...rest];

    expect(verifyReplay(steeredOnceMore)).not.toEqual(verified(replay));
  });
});

describe('effectiveInput', () => {
  /** Everything that decides how a game goes on, except the river, which is the same for every game. */
  const outcomeOf = (state: GameState): string =>
    JSON.stringify({ ...state, world: null, destroyedBridges: [...state.destroyedBridges] });

  it('only leaves out controls that the engine would have ignored', () => {
    // One game gets what the player pressed, the other what the engine listens to: they must never drift apart.
    for (let seed = 1; seed <= 20; seed++) {
      const policy = noisyPolicy(seed);
      const pressed = createGame();
      const listened = createGame();
      for (let tick = 0; pressed.phase !== 'gameOver'; tick++) {
        const controls = policy(pressed, tick);
        advance(pressed, controls);
        advance(listened, effectiveInput(listened, controls));
        expect(outcomeOf(listened), `seed ${seed}, tick ${tick}`).toBe(outcomeOf(pressed));
      }
    }
  });
});

describe('golden runs', () => {
  it('were recorded with the current engine version', () => {
    expect(GOLDEN_RUNS_ENGINE_VERSION, 'ENGINE_VERSION changed: run `pnpm record-golden-runs`').toBe(ENGINE_VERSION);
  });

  it(`still build the same ${GOLDEN_WORLD_SECTIONS} sections of river, which the runs do not reach`, async () => {
    expect(
      await worldDigest(),
      'The river generator changed what the world looks like. If that is intended, bump ENGINE_VERSION in replay.ts and run `pnpm record-golden-runs`.',
    ).toBe(GOLDEN_WORLD_DIGEST);
  });

  it.each(GOLDEN_RUNS)('are recordings the API accepts: "$name"', ({ replay }) => {
    expect(replayProblem(replay)).toBeNull();
  });

  it.each(GOLDEN_RUNS)('still play back as the run "$name"', ({ replay, score, ticks }) => {
    expect(
      verifyReplay(replay),
      'The rules changed what this run leads to. If that is intended, bump ENGINE_VERSION in replay.ts and run `pnpm record-golden-runs`.',
    ).toMatchObject({ ok: true, score, ticks });
  });
});
