---
id: 2026-10-01-1900-analytics-consent-by-countdown
title: Google Analytics starts when the visitor accepts, or when a countdown ends unanswered
type: decision
status: accepted
domain: [privacy, frontend, architecture]
projects: [river-raid-game]
ai_context: false
ai_scope:
  - global
created: 2026-10-01
updated: 2026-10-01
---

## Context

The site counts visits with Google Analytics, which sets cookies (`_ga`, `_ga_*`) and sends the visitor's address and page views to Google. Until then the project stored no cookie and no personal data on the visitor's side, so there was no banner. The owner asked for a banner with a countdown, and for a visitor who does not click to be taken as having accepted.

## Decision

- **A banner on the first visit** offers Accept and Decline, with a visible countdown (`CONSENT_TIMEOUT_SECONDS`, ten seconds). If neither button is clicked when it ends, the choice is `CONSENT_WITHOUT_ANSWER`, which is `'granted'`. Both constants are in `src/ui/useAnalyticsConsent.ts`; changing the second to `'denied'` makes Analytics opt-in with nothing else to touch.
- **Nothing loads before there is a choice.** `gtag.js` is not requested and no cookie is set while the banner counts down; there is no Consent Mode in its "advanced" form, which would send cookieless pings before any answer. A visitor who declines is never sent anything.
- **The choice is remembered** in `localStorage` (`river-raid:analytics-consent`), so the banner is not shown again. It is stored the same way whether the visitor clicked or the countdown ended.
- **The choice can be changed**: the title screen has an "Analytics settings" button that shows the banner again, without a countdown (a visitor who is only looking must never be opted in by a timer). Declining after accepting sets Google's `ga-disable-<id>` switch, so the tag already running stays quiet, and removes the `_ga` cookies.
- **Layers.** The UI depends on two ports in `src/application/ports.ts`: `Analytics` (`start`, `stop`) and the consent methods of `Preferences`. `GoogleAnalytics` is the adapter; in development a silent one stands in, so `pnpm dev` never counts.

## Consequences

- **Silence is not consent in law.** Under the GDPR (Planet49, C-673/17; recital 32) and the LGPD (art. 5, XII: consent is a free, informed and unambiguous manifestation of will), a visitor who did nothing has not consented, and cookies for statistics need consent before they are set. This design sets them anyway after ten seconds. That is the owner's decision, taken knowing this; it is recorded here and in the residual risks of [the security review](../security.md). The site is small and the data is page views, which lowers the stakes without removing the question. The one-constant switch above is the way back.
- Visitors who leave before the countdown ends, or who decline, are not counted: the numbers undercount, and the more privacy-conscious visitors the most.
- The countdown keeps running during a game, since it belongs to the page, not to a screen. The banner is a strip at the bottom of the screen.
