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
import { GOLDEN_RUNS, GOLDEN_RUNS_ENGINE_VERSION, GOLDEN_WORLD_DIGEST } from './testing/golden-runs.ts';
import { cautiousPilot, noisyPolicy, recordRun } from './testing/pilot.ts';
import { GOLDEN_WORLD_SECTIONS, worldDigest } from './testing/world-digest.ts';
import { NO_INPUT, type Input } from './types.ts';

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
    expect(verifyReplay(run.replay)).toEqual({ ok: true, score: run.score, ticks: run.ticks });
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
      expect(verifyReplay(random.replay), `seed ${seed}`).toEqual({ ok: true, score: random.score, ticks: random.ticks });
    }
  });

  it('does not reproduce the score when the controls are different', () => {
    const handsOff = run.replay.map((value, index) => (index % 2 === 0 ? 0 : value));
    const verdict = verifyReplay(handsOff);
    expect(verdict.ok && verdict.score === run.score).toBe(false);
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
    ).toEqual({ ok: true, score, ticks });
  });
});
