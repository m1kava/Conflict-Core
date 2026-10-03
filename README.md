# Conflict Core

**An online multiplayer real-time strategy game that runs in the browser** — on desktop, tablet and phone,
with nothing to install and nothing to pay for. Build a base, run supply trucks, keep the power on, field
tanks, infantry, anti-air and artillery, and break the enemy base — against the AI or real players.

All factions, units, maps, models, sounds and UI are original. Inspired by the *style* of classic modern-military
PC RTS games; no copyrighted content is used.

## Play

| How | Steps |
|---|---|
| **In the browser now (GitHub Pages)** | <https://m1kava.github.io/Conflict-Core/> — published automatically on every push. Pages hosts static files only, so the game server runs inside your browser: **Play vs AI** works fully; online modes need the hosted server (below). |
| **Locally (one command)** | `npm install && npm run build && npm start` → open <http://localhost:8080> |
| **With Docker** | `docker build -t conflict-core . && docker run --rm -p 8080:8080 conflict-core` |
| **Online for free** | Deploy this repository on [Render](https://render.com) via *New → Blueprint* (uses `render.yaml`, free plan) and share the URL. Any host that runs a Docker container or Node 20+ works. |

In the game: **Play vs AI** (easy / normal / hard), **Quick Match** (pairs the next two players), or
**Create private room** and send the code or invite link to a friend.

## What's in the game today

| Area | Status |
|---|---|
| Server-authoritative multiplayer (WebSocket), quick match, private rooms with codes/links, games vs AI | **Implemented** |
| Reconnect after network drops (90 s grace, full resync, duplicate-command protection) | **Implemented** |
| Fog of war enforced on the server (hidden enemies are never sent) | **Implemented** |
| Base building: Command HQ, Power Plant, Supply Depot, Barracks, Vehicle Plant, Guard Tower, Radar Uplink | **Implemented** |
| Economy: supply fields + trucks, credits, power (low power slows production, shuts towers and radar) | **Implemented** |
| Units: engineer, rifle squad, AT team, supply truck, recon vehicle, main battle tank, AA vehicle, artillery | **Implemented** |
| Combat: armor × damage matrix, turrets, bursts, hitscan / shells / guided missiles / artillery, splash, veterancy | **Implemented** |
| Pathfinding (A* + smoothing + group path sharing), formations, collision avoidance | **Implemented** |
| Mouse/keyboard and touch controls, RTS camera, minimap, HUD, settings, results | **Implemented** |
| AI opponent that plays through normal player commands | **Implemented** |
| 3D graphics: procedural models, instanced rendering, terrain, river, bridge, vegetation, effects, quality presets | **Implemented** (models are procedural, see [Asset pipeline](docs/ASSET_PIPELINE.md)) |
| Sound: procedural WebAudio effects | **Implemented** (no music yet) |
| Bastion Union and Sable Front factions, aircraft, superweapons, more maps | **Planned** |
| Accounts, rankings, match history | **Planned** (needs a database; the game works without it) |

## Technology

| Layer | Technology | Why |
|---|---|---|
| Client | TypeScript, **Three.js** (WebGL 2), Vite | Runs in every modern browser incl. mobile; free and open source |
| Shared code | TypeScript package `@conflict/shared` | One implementation of rules, data, map and protocol for client, server, AI and tests |
| Game server | **Node.js 20+**, `ws` | Authoritative 15 Hz simulation, lobby, matchmaking; one small process |
| Tests & tooling | Vitest, ESLint, Prettier, Playwright | Unit/integration tests, headless browser checks |
| Delivery | Docker, GitHub Actions, optional Render blueprint | Free CI and free hosting option |

Everything is free/open-source software. No accounts, keys or paid services are needed to build, run or host the game.

## Repository layout

```
packages/
  shared/   game data (JSON), terrain & maps, authoritative simulation, AI bot, network protocol
  server/   Node game server: HTTP (serves the client), WebSocket lobby/matches, benchmark & bot scripts
  client/   browser client: rendering (Three.js), input, HUD, menus, audio
scripts/    headless-browser smoke, gameplay and battle screenshot scripts
docs/       architecture, networking, gameplay, performance, deployment, roadmap, ADRs
Client/ Shared/ Server/ Tools/ Tests/   legacy C#/Unity prototype from the first iteration (superseded)
```

## Development

```bash
npm install
npm run dev          # server on :8080 (auto-restart) + Vite dev client on :5173 (proxying /ws)
npm test             # 62 unit, simulation, rendering-budget and server integration tests
npm run check        # typecheck + lint + format check + tests + data validation (what CI runs)
npm run simulate     # headless AI-vs-AI match on the real simulation
npm run benchmark    # server tick time and bandwidth at 10–400 units
```

Developer tools (never enabled in production): start the server with `DEV_TOOLS=1` and open
`http://localhost:8080/?battle=200` for a scripted 200-unit battle; add `?debug` for test hooks.
Press **F3** in a match for the performance overlay.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, module boundaries, implementation status |
| [NETWORKING.md](docs/NETWORKING.md) | Authority model, protocol, snapshots, fog, reconnect, anti-cheat |
| [GAMEPLAY.md](docs/GAMEPLAY.md) | Factions, units, economy, combat, controls |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | Budgets and measured benchmark results |
| [ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | How models, textures, effects and sounds are produced |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | CI, Docker, free hosting, versioning |
| [BACKEND.md](docs/BACKEND.md) | Planned accounts/rankings backend and database |
| [ROADMAP.md](docs/ROADMAP.md) | Milestones and risks |
| [VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md) | First complete playable milestone |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Conventions and workflow |
| [docs/adr/](docs/adr) | Architecture decision records |
