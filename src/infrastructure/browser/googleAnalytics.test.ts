// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installGoogleAnalytics } from './googleAnalytics.ts';

type GtagWindow = Window & { dataLayer?: IArguments[] };

afterEach(() => {
  delete (window as GtagWindow).dataLayer;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

describe('installGoogleAnalytics', () => {
  it('loads gtag.js for the measurement id without blocking the page', () => {
    installGoogleAnalytics('G-TEST123');

    const script = document.head.querySelector('script');
    expect(script?.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
    expect(script?.async).toBe(true);
  });

  it('queues the start and the configuration for gtag.js', () => {
    installGoogleAnalytics('G-TEST123');

    // gtag.js only understands `arguments` objects in the data layer, not arrays.
    const queue = (window as GtagWindow).dataLayer ?? [];
    expect(queue.map((entry) => Object.prototype.toString.call(entry))).toEqual(['[object Arguments]', '[object Arguments]']);
    expect(Array.from(queue[0]!)[0]).toBe('js');
    expect(Array.from(queue[0]!)[1]).toBeInstanceOf(Date);
    expect(Array.from(queue[1]!)).toEqual(['config', 'G-TEST123']);
  });

  it('keeps what was already in the data layer', () => {
    const existing = ['something else'];
    (window as unknown as { dataLayer: unknown[] }).dataLayer = existing;

    installGoogleAnalytics('G-TEST123');

    expect((window as GtagWindow).dataLayer).toBe(existing);
    expect(existing).toHaveLength(3);
  });
});
