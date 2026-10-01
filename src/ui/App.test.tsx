// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { LeaderboardError } from '../application/ports.ts';
import { App } from './App.tsx';
import { STUB_REPLAY, createFakeServices, entry } from './testSupport.ts';

afterEach(cleanup);

const press = (code: string): void => {
  act(() => {
    fireEvent.keyDown(window, { code });
  });
};

function startGame(setup = createFakeServices()) {
  render(<App services={setup.services} />);
  press('Enter');
  return setup;
}

async function finishGame(setup: ReturnType<typeof createFakeServices>, score: number) {
  await act(async () => {
    setup.games[0]!.finish(score);
  });
}

describe('title screen', () => {
  it('lists the best pilots', async () => {
    const { services, leaderboard } = createFakeServices();
    leaderboard.entries = [entry(1, 'AAA', 52_300), entry(2, 'BBB', 3_000)];
    render(<App services={services} />);

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('52,300')).toBeTruthy();
    expect(within(table).getByText('BBB')).toBeTruthy();
  });

  it('explains what every target is worth', () => {
    render(<App services={createFakeServices().services} />);

    expect(screen.getByText('Bridge').nextElementSibling?.textContent).toBe('500');
    expect(screen.getByText('Tanker').nextElementSibling?.textContent).toBe('30');
    expect(screen.getByText(/spare jet for every 10,000 points/i)).toBeTruthy();
  });

  it('invites the first pilot when the board is empty', async () => {
    render(<App services={createFakeServices().services} />);
    expect(await screen.findByText(/no scores yet/i)).toBeTruthy();
  });

  it('explains an unreachable leaderboard and lets the player try again', async () => {
    const { services, leaderboard } = createFakeServices();
    leaderboard.entries = [entry(1, 'AAA', 100)];
    leaderboard.topScores.mockRejectedValueOnce(new LeaderboardError('network', 'down'));
    render(<App services={services} />);

    expect(await screen.findByText(/offline/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('leaves Enter and Space to the button that has the focus', async () => {
    const { services, leaderboard } = createFakeServices();
    leaderboard.entries = [entry(1, 'AAA', 100)];
    leaderboard.topScores.mockRejectedValueOnce(new LeaderboardError('network', 'down'));
    render(<App services={services} />);
    const tryAgain = await screen.findByRole('button', { name: /try again/i });

    for (const code of ['Enter', 'Space']) {
      expect(fireEvent.keyDown(tryAgain, { code }), `${code} was taken from the button`).toBe(true);
    }

    expect(screen.queryByRole('img', { name: /game screen/i })).toBeNull();
  });

  it('starts a run with Enter and registers it with the leaderboard', async () => {
    const { games, leaderboard } = startGame();
    expect(games).toHaveLength(1);
    expect(leaderboard.startSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: /game screen/i })).toBeTruthy();
  });
});

describe('game screen', () => {
  it('pauses and resumes with P', () => {
    const { games } = startGame();

    press('KeyP');
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(games[0]!.pause).toHaveBeenCalled();

    press('KeyP');
    expect(screen.queryByText('Paused')).toBeNull();
    expect(games[0]!.resume).toHaveBeenCalled();
  });

  it('pauses when the window loses focus', () => {
    const { games } = startGame();
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(games[0]!.pause).toHaveBeenCalled();
  });

  it('mutes with M and remembers it', () => {
    const { games, preferences } = startGame();

    press('KeyM');

    expect(games[0]!.setMuted).toHaveBeenLastCalledWith(true);
    expect(preferences.saveMuted).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: /sound off/i })).toBeTruthy();
  });

  it('starts muted when the player muted it before', () => {
    const setup = createFakeServices();
    setup.preferences.muted = true;
    startGame(setup);
    expect(setup.games[0]!.setMuted).toHaveBeenLastCalledWith(true);
  });

  it('releases the game when it ends', async () => {
    const setup = startGame();
    await finishGame(setup, 0);
    expect(setup.games[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it('survives Strict Mode: the first game is disposed and only one stays alive', () => {
    const setup = createFakeServices();
    const { unmount } = render(
      <StrictMode>
        <App services={setup.services} />
      </StrictMode>,
    );
    press('Enter');

    expect(setup.games).toHaveLength(2);
    expect(setup.games[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(setup.games[1]!.dispose).not.toHaveBeenCalled();

    unmount();
    expect(setup.games[1]!.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('game over', () => {
  it('saves the score under the chosen initials and shows the ranking', async () => {
    const setup = startGame();
    await finishGame(setup, 4_200);

    expect(await screen.findByText('4,200')).toBeTruthy();
    const input = await screen.findByLabelText(/enter your initials/i);
    fireEvent.change(input, { target: { value: 'ab-1x' } });
    expect((input as HTMLInputElement).value).toBe('AB1');
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(await screen.findByText(/you placed #1/i)).toBeTruthy();
    expect(setup.leaderboard.submitScore).toHaveBeenCalledWith({
      sessionId: 'session-1',
      initials: 'AB1',
      run: { score: 4_200, replay: STUB_REPLAY },
    });
    expect(setup.preferences.saveInitials).toHaveBeenCalledWith('AB1');
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save score/i })).toBeNull();
  });

  it('suggests the initials used last time and only saves complete ones', async () => {
    const setup = createFakeServices();
    setup.preferences.initials = 'IUR';
    startGame(setup);
    await finishGame(setup, 100);

    const input = (await screen.findByLabelText(/enter your initials/i)) as HTMLInputElement;
    expect(input.value).toBe('IUR');

    fireEvent.change(input, { target: { value: 'IU' } });
    expect((screen.getByRole('button', { name: /save score/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the form and explains what went wrong when saving fails', async () => {
    const setup = startGame();
    setup.leaderboard.submitScore.mockRejectedValueOnce(new LeaderboardError('network', 'down'));
    await finishGame(setup, 900);

    fireEvent.change(await screen.findByLabelText(/enter your initials/i), { target: { value: 'ABC' } });
    fireEvent.click(screen.getByRole('button', { name: /save score/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/cannot be reached/i);

    fireEvent.click(screen.getByRole('button', { name: /save score/i }));
    expect(await screen.findByText(/you placed #1/i)).toBeTruthy();
  });

  it('does not ask for initials when the leaderboard was unreachable at the start', async () => {
    const setup = createFakeServices();
    setup.leaderboard.startSession.mockRejectedValueOnce(new LeaderboardError('network', 'down'));
    startGame(setup);
    await finishGame(setup, 700);

    expect(await screen.findByText(/leaderboard is offline/i)).toBeTruthy();
    expect(screen.queryByLabelText(/enter your initials/i)).toBeNull();
  });

  it('does not ask for initials after a scoreless run', async () => {
    const setup = startGame();
    await finishGame(setup, 0);

    expect(await screen.findByText(/fly a little farther/i)).toBeTruthy();
    expect(screen.queryByLabelText(/enter your initials/i)).toBeNull();
  });

  it('starts a new run, with a fresh leaderboard session, from "Play again"', async () => {
    const setup = startGame();
    await finishGame(setup, 0);

    fireEvent.click(await screen.findByRole('button', { name: /play again/i }));

    expect(setup.games).toHaveLength(2);
    expect(setup.leaderboard.startSession).toHaveBeenCalledTimes(2);
  });

  it('plays again with Enter once there is no form to submit', async () => {
    const setup = startGame();
    await finishGame(setup, 0);
    await screen.findByRole('button', { name: /play again/i });

    press('Enter');

    expect(setup.games).toHaveLength(2);
  });

  it('leaves Enter to the form while initials are being typed', async () => {
    const setup = startGame();
    await finishGame(setup, 500);
    await screen.findByLabelText(/enter your initials/i);

    press('Enter');

    expect(setup.games).toHaveLength(1);
  });

  it('goes back to the title screen', async () => {
    const setup = startGame();
    await finishGame(setup, 0);

    fireEvent.click(await screen.findByRole('button', { name: /title screen/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /river raid/i })).toBeTruthy());
  });
});
