import { describe, expect, it } from 'vitest';
import { BrowserPreferences } from './browserPreferences.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
}

describe('BrowserPreferences', () => {
  it('remembers initials and the mute setting', () => {
    const storage = memoryStorage();
    const first = new BrowserPreferences(storage);
    first.saveInitials('ABC');
    first.saveMuted(true);

    const second = new BrowserPreferences(storage);
    expect(second.loadInitials()).toBe('ABC');
    expect(second.loadMuted()).toBe(true);
  });

  it('starts with no initials and sound on', () => {
    const preferences = new BrowserPreferences(memoryStorage());
    expect(preferences.loadInitials()).toBe('');
    expect(preferences.loadMuted()).toBe(false);
  });

  it('cleans up initials that were stored by hand', () => {
    const storage = memoryStorage();
    storage.setItem('river-raid:initials', 'a-b!cdef');
    expect(new BrowserPreferences(storage).loadInitials()).toBe('ABC');
  });

  it('has no analytics answer until the visitor gives one, and remembers it afterwards', () => {
    const storage = memoryStorage();
    expect(new BrowserPreferences(storage).loadAnalyticsConsent()).toBeNull();

    new BrowserPreferences(storage).saveAnalyticsConsent('denied');
    expect(new BrowserPreferences(storage).loadAnalyticsConsent()).toBe('denied');

    new BrowserPreferences(storage).saveAnalyticsConsent('granted');
    expect(new BrowserPreferences(storage).loadAnalyticsConsent()).toBe('granted');
  });

  it('takes anything but an answer it knows for no answer', () => {
    const storage = memoryStorage();
    storage.setItem('river-raid:analytics-consent', 'maybe');
    expect(new BrowserPreferences(storage).loadAnalyticsConsent()).toBeNull();
  });

  it('keeps working when the storage is missing or throws', () => {
    const broken = new BrowserPreferences({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(broken.loadInitials()).toBe('');
    expect(broken.loadAnalyticsConsent()).toBeNull();
    expect(() => broken.saveMuted(true)).not.toThrow();

    const missing = new BrowserPreferences(null);
    expect(missing.loadMuted()).toBe(false);
    expect(() => missing.saveAnalyticsConsent('granted')).not.toThrow();
    expect(() => missing.saveInitials('ABC')).not.toThrow();
  });
});
