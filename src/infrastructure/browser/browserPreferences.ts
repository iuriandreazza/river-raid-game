import { sanitizeInitials } from '../../../shared/initials.ts';
import type { AnalyticsConsent, Preferences } from '../../application/ports.ts';

const INITIALS_KEY = 'river-raid:initials';
const MUTED_KEY = 'river-raid:muted';
const ANALYTICS_CONSENT_KEY = 'river-raid:analytics-consent';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage can be missing or full (private windows, blocked site data): preferences then just do not stick. */
export class BrowserPreferences implements Preferences {
  private readonly storage: KeyValueStorage | null;

  constructor(storage: KeyValueStorage | null = readStorage()) {
    this.storage = storage;
  }

  loadInitials(): string {
    return sanitizeInitials(this.read(INITIALS_KEY) ?? '');
  }

  saveInitials(initials: string): void {
    this.write(INITIALS_KEY, initials);
  }

  loadMuted(): boolean {
    return this.read(MUTED_KEY) === 'true';
  }

  saveMuted(muted: boolean): void {
    this.write(MUTED_KEY, String(muted));
  }

  loadAnalyticsConsent(): AnalyticsConsent | null {
    const stored = this.read(ANALYTICS_CONSENT_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  }

  saveAnalyticsConsent(consent: AnalyticsConsent): void {
    this.write(ANALYTICS_CONSENT_KEY, consent);
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Not being able to remember a preference is not worth interrupting the game.
    }
  }
}

function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
