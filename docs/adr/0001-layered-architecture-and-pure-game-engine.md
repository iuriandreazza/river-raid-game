---
id: 2026-10-01-1100-layered-architecture-and-pure-game-engine
title: Layered architecture with a pure game engine
type: decision
status: accepted
domain: [architecture, game]
projects: [river-raid-game]
ai_context: false
ai_scope:
  - global
created: 2026-10-01
updated: 2026-10-01
---

## Context

The game has to run in the browser with React, look like a 160×192 console game, and stay playable at any screen refresh rate. Its rules (collisions, fuel, scoring, bridges, restarts) are where the bugs would hide, and they are easy to get wrong when mixed with rendering or React state. The river must also be identical on every run, so that scores can be compared on a global board.

## Decision

Split the web client in four layers that only depend inwards, with the browser kept at the edge:

- **`src/domain`**: the game as plain TypeScript. `advance(state, input)` moves the world by one tick and returns the events that happened (a missile was fired, a bridge fell, a jet was lost). No DOM, no React, no clock, no randomness other than a seeded generator. The river is a pure function of the section number.
- **`src/application`**: ports (`InputPort`, `RendererPort`, `SoundPort`, `FrameScheduler`, `LeaderboardPort`, `Preferences`) and `GameSession`, which runs the engine at a fixed 60 ticks per second whatever the refresh rate.
- **`src/infrastructure`**: adapters for the ports: canvas renderer, keyboard, Web Audio, `fetch`, `localStorage`.
- **`src/ui`**: React screens. They draw menus; they never hold per-frame state. The game screen creates the session in an effect and disposes it in the cleanup, which keeps Strict Mode's double mounting harmless.
- **`src/compositionRoot.ts`**: the only place where ports meet adapters.

ESLint `no-restricted-imports` rules make the direction of the dependencies a build error. The API follows the same shape (`server/domain`, `server/application`, `server/infrastructure`).

The simulation uses whole rows and columns, like the original scanlines, and runs at a fixed step; rendering interpolates nothing.

## Consequences

- The whole rule set is covered by fast tests that need no browser: generated rivers are checked against navigability invariants over 80 sections, and the engine is exercised tick by tick.
- Adapters can be replaced or faked: the screens are tested with fake services, the loop with a fake scheduler.
- There is more indirection than a single-file game would need. It pays for itself in testability, and the layers are thin.
- The renderer is the one part that is verified by eye, in the browser, rather than by tests.

## Alternatives considered

- **Game logic inside React components and hooks.** Rejected: per-frame state would re-render the tree 60 times a second, and the rules could only be tested through the DOM.
- **A game framework (Phaser and similar).** Rejected: heavy for a 160×192 canvas, and it would hide the fixed-step, deterministic engine this game depends on.
- **A variable time step.** Rejected: collisions and scoring should not depend on frame timing, and a fixed step keeps runs reproducible.

## Related

- [ADR 0002: Global leaderboard API](0002-global-leaderboard-api.md)
