import type { AnalyticsConsent } from '../application/ports.ts';
import { CONSENT_WITHOUT_ANSWER } from './useAnalyticsConsent.ts';

interface ConsentBannerProps {
  consent: AnalyticsConsent | null;
  secondsLeft: number | null;
  onAnswer: (consent: AnalyticsConsent) => void;
}

function statement(consent: AnalyticsConsent | null, secondsLeft: number | null): string {
  if (secondsLeft !== null) {
    const outcome = CONSENT_WITHOUT_ANSWER === 'granted' ? 'turns on' : 'stays off';
    return `This site counts visits with Google Analytics, which sets cookies. It ${outcome} in ${secondsLeft}s unless you choose.`;
  }
  return `Google Analytics, which counts visits with cookies, is ${consent === 'granted' ? 'on' : 'off'}.`;
}

export function ConsentBanner({ consent, secondsLeft, onAnswer }: ConsentBannerProps) {
  return (
    <section className="consent" aria-label="Analytics">
      <p className="consent__text">{statement(consent, secondsLeft)}</p>
      <div className="consent__actions">
        <button type="button" className="button button--small" onClick={() => onAnswer('denied')}>
          Decline
        </button>
        <button type="button" className="button button--small button--primary" onClick={() => onAnswer('granted')}>
          Accept
        </button>
      </div>
    </section>
  );
}
