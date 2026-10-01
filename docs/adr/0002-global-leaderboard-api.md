---
id: 2026-10-01-1110-global-leaderboard-api
title: Global leaderboard API
type: decision
status: accepted
domain: [architecture, backend, security]
projects: [river-raid-game]
ai_context: false
ai_scope:
  - global
created: 2026-10-01
updated: 2026-10-01
---

## Context

A leaderboard is only *global* if every player reads and writes the same data, so the game needs a server. The game runs in the player's browser, so a submitted score cannot be trusted: anybody can call the API by hand. The hosting platform is not decided yet, and the project should start simple.

## Decision

A small Node API (Hono) with a SQLite file as storage, served by the same process that hosts the built web client:

- **One process, one origin.** `pnpm start` serves `dist/` and `/api`. No CORS, no second deployment. In development, Vite proxies `/api`.
- **Storage behind a port.** `LeaderboardStore` has a SQLite adapter (`node:sqlite`, no native dependency) and an in-memory one used by tests. Both run the same contract test suite. Moving to another database means writing one adapter.
- **Play sessions instead of signed tokens.** A run first calls `POST /api/sessions`; the server stores when it started. A score is accepted once per session (a `UNIQUE` constraint on the score table, so racing requests cannot both win) and only if it does not exceed `300 points per second × elapsed time + 1000`. Sessions are in the database, so there is no secret to manage, and unused sessions older than a day are pruned when a new one opens.
- **Arcade initials.** The name is exactly three characters, `A–Z` or `0–9`. It is easy to validate and avoids free-text abuse.
- **The limit is tied to the game.** `MAX_SCORE_PER_SECOND` lives in `shared/` and a domain test proves the generated rivers can never offer more points per second than the API accepts at the fastest flying speed.
- **A deterministic river** makes scores comparable: nobody gets an easier course.

## Consequences

- The board becomes global when the server is deployed on a host that gives the process a persistent disk (a Docker volume on `/data` in the provided image).
- SQLite on a local file means one server instance. Scaling out needs a networked database and a new adapter; the port is already there.
- This stops casual cheating (a `curl` with a huge score, replays, absurd rates). It does **not** stop an attacker who patiently submits plausible scores. Stronger guarantees would need server-side simulation from recorded inputs, or authentication. There is also no rate limiting; put the server behind a reverse proxy that provides it if the board matters.
- When the plausibility check and the replay check both apply, the API answers `422` before `409`, so that an implausible attempt does not burn the session.

## Alternatives considered

- **A hosted backend (Firebase, Supabase, Cloudflare D1).** Viable, and the port keeps the option open. Rejected as the default because it ties the project to one vendor before the hosting is chosen.
- **`localStorage`.** Not global.
- **HMAC-signed session tokens.** Stateless, but they need a secret and give no way to enforce one score per session without storing something anyway.
- **Free-text names.** More expressive, but they need moderation.

## Related

- [ADR 0001: Layered architecture with a pure game engine](0001-layered-architecture-and-pure-game-engine.md)
