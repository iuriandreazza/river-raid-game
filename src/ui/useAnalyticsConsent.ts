import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsConsent } from '../application/ports.ts';
import type { AppServices } from './services.ts';

/** How long a first-time visitor has to answer the banner. */
export const CONSENT_TIMEOUT_SECONDS = 10;

/** What a visitor who never answers is taken to have chosen. Set to 'denied' to make Analytics opt-in. */
export const CONSENT_WITHOUT_ANSWER: AnalyticsConsent = 'granted';

export interface AnalyticsConsentControl {
  consent: AnalyticsConsent | null;
  /** Whether the banner is showing. */
  asking: boolean;
  /** Seconds until an unanswered banner decides for the visitor; null when nothing is counting down. */
  secondsLeft: number | null;
  answer(consent: AnalyticsConsent): void;
  /** Shows the banner again so the visitor can change their mind. It never decides on its own. */
  reopen(): void;
}

export function useAnalyticsConsent({ preferences, analytics }: Pick<AppServices, 'preferences' | 'analytics'>): AnalyticsConsentControl {
  const [consent, setConsent] = useState(() => preferences.loadAnalyticsConsent());
  const [asking, setAsking] = useState(consent === null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(consent === null ? CONSENT_TIMEOUT_SECONDS : null);

  const answer = useCallback(
    (choice: AnalyticsConsent) => {
      preferences.saveAnalyticsConsent(choice);
      setConsent(choice);
      setAsking(false);
      setSecondsLeft(null);
    },
    [preferences],
  );

  const reopen = useCallback(() => setAsking(true), []);

  // The one place where the choice reaches the tracker, for a saved choice and for a new one alike.
  useEffect(() => {
    if (consent === 'granted') analytics.start();
    else if (consent === 'denied') analytics.stop();
  }, [consent, analytics]);

  useEffect(() => {
    if (secondsLeft === null) return;
    const timer = setTimeout(() => {
      if (secondsLeft > 1) setSecondsLeft(secondsLeft - 1);
      else answer(CONSENT_WITHOUT_ANSWER);
    }, 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, answer]);

  return { consent, asking, secondsLeft, answer, reopen };
}
