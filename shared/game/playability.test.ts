import { describe, expect, it } from 'vitest';
import { SECTION_LENGTH, STARTING_RESERVE_JETS } from './constants.ts';
import { advance, createGame } from './game.ts';
import { pilot } from './testing/pilot.ts';
import { noseRowOf } from './view.ts';

describe('the river', () => {
  it('can be flown by a pilot that only follows the water, refuels and shoots the bridges', () => {
    const state = createGame();
    const sections = 30;
    const ticks = sections * SECTION_LENGTH * 1.2;

    for (let tick = 0; tick < ticks && state.scroll < sections * SECTION_LENGTH; tick++) {
      state.enemies = [];
      advance(state, pilot(state));
      expect(state.phase, `crashed at row ${noseRowOf(state.scroll)}`).toBe('playing');
    }

    expect(state.scroll).toBeGreaterThanOrEqual(sections * SECTION_LENGTH);
    expect(state.reserveJets).toBeGreaterThanOrEqual(STARTING_RESERVE_JETS);
    expect(state.destroyedBridges.size).toBe(sections);
  });
});
