const GTAG_URL = 'https://www.googletagmanager.com/gtag/js';

type GtagWindow = Window & { dataLayer?: unknown[] };

/**
 * Starts Google Analytics: the page's inline snippet, moved here because the CSP forbids inline script. The hosts it
 * talks to are the ones the CSP in `server/infrastructure/http/create-app.ts` allows.
 */
export function installGoogleAnalytics(measurementId: string, page: Document = document): void {
  const dataLayer = ((page.defaultView as GtagWindow).dataLayer ??= []);

  // gtag.js reads `arguments` objects from the data layer and ignores arrays, so this must be a plain function that
  // pushes `arguments`, not a rest-parameter one that pushes its array.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function gtag(..._command: unknown[]): void {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  }

  gtag('js', new Date());
  gtag('config', measurementId);

  const script = page.createElement('script');
  script.async = true;
  script.src = `${GTAG_URL}?id=${encodeURIComponent(measurementId)}`;
  page.head.appendChild(script);
}
