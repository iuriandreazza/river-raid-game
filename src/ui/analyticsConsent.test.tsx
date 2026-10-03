// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { createFakeServices } from './testSupport.ts';
import { CONSENT_TIMEOUT_SECONDS } from './useAnalyticsConsent.ts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const banner = () => screen.queryByRole('region', { name: 'Analytics' });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** One second at a time, because the countdown schedules each second once the page has drawn the one before. */
function wait(seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    act(() => void vi.advanceTimersByTime(1000));
  }
}

function visit(consent: 'granted' | 'denied' | null = null) {
  const setup = createFakeServices();
  setup.preferences.consent = consent;
  render(<App services={setup.services} />);
  return setup;
}

describe('the analytics banner', () => {
  it('asks a first-time visitor, and starts nothing until there is an answer', () => {
    const { analytics, preferences } = visit();

    expect(banner()?.textContent).toMatch(/google analytics/i);
    expect(analytics.start).not.toHaveBeenCalled();
    expect(analytics.stop).not.toHaveBeenCalled();
    expect(preferences.saveAnalyticsConsent).not.toHaveBeenCalled();
  });

  it('starts Analytics when the visitor accepts, and remembers it', () => {
    const { analytics, preferences } = visit();

    click('Accept');

    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(preferences.saveAnalyticsConsent).toHaveBeenCalledWith('granted');
    expect(banner()).toBeNull();
  });

  it('keeps Analytics off when the visitor declines, however long they stay', () => {
    const { analytics, preferences } = visit();

    click('Decline');
    wait(CONSENT_TIMEOUT_SECONDS * 6);

    expect(analytics.start).not.toHaveBeenCalled();
    expect(analytics.stop).toHaveBeenCalled();
    expect(preferences.saveAnalyticsConsent).toHaveBeenCalledTimes(1);
    expect(preferences.saveAnalyticsConsent).toHaveBeenCalledWith('denied');
    expect(banner()).toBeNull();
  });

  it('counts down on screen', () => {
    visit();
    expect(banner()?.textContent).toContain(`in ${CONSENT_TIMEOUT_SECONDS}s`);

    wait(3);

    expect(banner()?.textContent).toContain(`in ${CONSENT_TIMEOUT_SECONDS - 3}s`);
  });

  it('takes silence for acceptance once the countdown ends', () => {
    const { analytics, preferences } = visit();

    wait(CONSENT_TIMEOUT_SECONDS - 1);
    expect(analytics.start).not.toHaveBeenCalled();
    expect(banner()).not.toBeNull();

    wait(1);

    expect(analytics.start).toHaveBeenCalledTimes(1);
    expect(preferences.saveAnalyticsConsent).toHaveBeenCalledWith('granted');
    expect(banner()).toBeNull();
  });

  it('does not ask again a visitor who already answered', () => {
    const accepted = visit('granted');
    expect(banner()).toBeNull();
    expect(accepted.analytics.start).toHaveBeenCalled();
    cleanup();

    const declined = visit('denied');
    expect(banner()).toBeNull();
    expect(declined.analytics.start).not.toHaveBeenCalled();
  });

  it('stays while a game is played, and does not take the keys of the game', () => {
    const { games } = visit();

    act(() => {
      fireEvent.keyDown(window, { code: 'Enter' });
    });

    expect(games).toHaveLength(1);
    expect(banner()).not.toBeNull();
  });
});

describe('changing the choice', () => {
  it('lets a visitor who accepted take it back', () => {
    const { analytics, preferences } = visit('granted');

    click('Analytics settings');
    expect(banner()?.textContent).toMatch(/is on/i);
    click('Decline');

    expect(preferences.saveAnalyticsConsent).toHaveBeenCalledWith('denied');
    expect(analytics.stop).toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it('lets a visitor who declined accept later', () => {
    const { analytics } = visit('denied');

    click('Analytics settings');
    expect(banner()?.textContent).toMatch(/is off/i);
    click('Accept');

    expect(analytics.start).toHaveBeenCalledTimes(1);
  });

  it('never decides for a visitor who is only looking at it', () => {
    const { analytics, preferences } = visit('denied');

    click('Analytics settings');
    wait(CONSENT_TIMEOUT_SECONDS * 10);

    expect(banner()).not.toBeNull();
    expect(analytics.start).not.toHaveBeenCalled();
    expect(preferences.saveAnalyticsConsent).not.toHaveBeenCalled();
  });
});
