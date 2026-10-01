import type { Analytics } from '../../application/ports.ts';

/** Stands in wherever visits are not to be counted: development, and tests. */
export const silentAnalytics: Analytics = {
  start: () => undefined,
  stop: () => undefined,
};
