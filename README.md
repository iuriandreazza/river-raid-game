# River Raid

A browser tribute to the 1982 Atari 2600 classic, built with React and TypeScript, with a **global leaderboard**.

![The game: a jet over the river with a fuel depot, a helicopter, a tanker and an explosion](docs/screenshot.png)

Fly upstream, shoot everything that moves, blow up the bridges and keep an eye on the fuel gauge. The river is the same on every run, so scores are comparable between pilots.

> Fan-made tribute. *River Raid* was created by Carol Shaw and published by Activision, which is not affiliated with and does not endorse this project. The code, sprites and sounds here are original: nothing was taken from the cartridge.

## How to play

| Key | Action |
| --- | --- |
| ← → (or A D) | Steer |
| ↑ (or W) | Fly faster |
| ↓ (or S) | Slow down |
| Space (or Z, X) | Fire. Hold it down for continuous fire; only one missile can be in flight |
| P or Esc | Pause (the game also pauses when the window loses focus) |
| M | Mute |

### Rules

- Crash into a river bank, an island, a bridge, an enemy or run out of fuel and you lose a jet. You start with **three spare jets** and earn another one every **10,000 points** (nine at most).
- Fly over a **fuel depot** to refuel: the slower you pass over it, the more you get. A siren sounds below a quarter of a tank. Shooting a depot scores, but denies you the fuel.
- Every section ends with a **bridge**. Shoot it to continue. After a crash you restart at the beginning of the current section, or at the beginning of the next one if you had already blown up the bridge.
- Light-green banks mean a plain river; dark-green banks add islands that split it in two.

| Target | Points |
| --- | --- |
| Tanker | 30 |
| Helicopter | 60 |
| Fuel depot | 80 |
| Jet | 100 |
| Bridge | 500 |

## Run it locally

Requires Node.js 24 and [pnpm](https://pnpm.io) (`nvm use` picks the right Node version).

```bash
pnpm install
pnpm dev
```

This starts the API on port 8787 and the web client on <http://localhost:5173>, which proxies `/api` to the API. Scores are stored in `data/leaderboard.sqlite`.

| Script | What it does |
| --- | --- |
| `pnpm dev` | API and web client with hot reload |
| `pnpm test` | Unit and component tests (Vitest) |
| `pnpm typecheck` | TypeScript, for the client, the server and the tooling |
| `pnpm lint` | ESLint, including the architecture boundaries between layers |
| `pnpm build` | Type-checks, bundles the client into `dist/` and compiles the server into `dist-server/` |
| `pnpm start` | Runs the built server, which also serves `dist/` |

## The global leaderboard

The board is only *global* once the server runs somewhere everybody can reach. A single Node process serves both the game and the API, so any host that runs a Node 24 process (or a container) and keeps a persistent disk will do.

```bash
pnpm build
PORT=8080 DATABASE_PATH=/var/lib/river-raid/leaderboard.sqlite pnpm start
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `DATABASE_PATH` | `data/leaderboard.sqlite` | SQLite file; its folder is created if needed |
| `STATIC_DIR` | `dist` when it exists | Folder with the built web client; leave it out to serve the API only |

With Docker, mount a volume on `/data`, otherwise every deploy starts with an empty board:

```bash
docker build -t river-raid .
docker run -p 8080:8080 -v river-raid-data:/data river-raid
```

### API

| Endpoint | Description |
| --- | --- |
| `POST /api/sessions` | Registers the start of a run. Returns `201 { sessionId }` |
| `POST /api/scores` | Body `{ sessionId, initials, score }`. Returns `201 { entry }` with the rank |
| `GET /api/scores?limit=10` | The best scores, highest first (`limit` from 1 to 100) |
| `GET /api/health` | `200 { status: "ok" }` |

Errors come as `{ error: { code, message } }`: `invalid_request` (400), `unknown_session` (404), `session_already_used` (409), `payload_too_large` (413), `implausible_score` (422) and `internal_error` (500). The wire format lives in [`shared/leaderboard-contract.ts`](shared/leaderboard-contract.ts).

### How scores are protected

A client-side game can always be tampered with, so the API only makes cheating harder than a single `curl`:

- A run first opens a **play session**, and the server notes when it started.
- A session can submit **one score**, enforced by a database constraint.
- The score cannot exceed what the elapsed time allows (300 points per second plus a small allowance). A test makes sure the game itself can never beat that limit.
- Initials are exactly three characters, `A–Z` or `0–9`.

It does not stop someone who replays the protocol patiently with plausible numbers, and there is no rate limiting. If the board matters, put the server behind a reverse proxy with rate limits, or add authentication.

## How it is built

```
src/
  domain/          the game: river generation, objects, collisions, scoring (pure TypeScript, no DOM, no React)
  application/     ports and the fixed-timestep game loop
  infrastructure/  adapters: canvas renderer, keyboard, Web Audio, HTTP client, localStorage
  ui/              React screens: title, game, game over, leaderboard
  compositionRoot.ts   wires the ports to their adapters
server/
  domain/          session and score rules
  application/     use cases and ports
  infrastructure/  SQLite and in-memory stores, Hono routes
shared/            the leaderboard contract, used by both sides
docs/adr/          architecture decisions
```

- The game runs at a fixed 60 ticks per second on a 160×192 canvas that CSS scales up; the world is a pure function of the section number, so every run meets the same river.
- React only draws menus. The game loop lives outside React state, and its screen creates and tears it down safely under Strict Mode.
- ESLint forbids inner layers from importing outer ones.

The reasoning is written down in [`docs/adr`](docs/adr).
