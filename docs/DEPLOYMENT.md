# Deployment

## Run anywhere

The game is one Node.js process that serves the browser client and the game server on a single port.

```bash
npm ci && npm run build
PORT=8080 npm start            # → http://localhost:8080
```

or with Docker:

```bash
docker build -t conflict-core .
docker run --rm -p 8080:8080 conflict-core
```

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | HTTP/WebSocket port |
| `HOST` | 0.0.0.0 | Bind address |
| `MAX_CONNECTIONS` | 500 | Concurrent sockets |
| `MAX_MATCHES` | 100 | Concurrent matches per process |
| `APP_VERSION` | 0.2.0 | Reported in `/healthz` |
| `LOG_LEVEL` | info | `debug` / `info` / `warn` / `error` (JSON-lines logs) |
| `DEV_TOOLS` | unset | `1` enables development-only scripted battles. **Never set in production.** |

Health check: `GET /healthz` → `{ ok, version, sessions, matches }`.

## Free hosting

`render.yaml` is a ready blueprint for Render's free plan: *New → Blueprint → select this repository*. Render builds
the Dockerfile and gives the game a public `https://…onrender.com` URL (WebSockets work over `wss://` automatically).
The free plan sleeps when idle; the first visitor after a pause waits about a minute.

Other free or low-cost options that run the same container or `npm start`: Fly.io, Railway, Koyeb, Google Cloud Run
(set min instances to 1 to keep matches alive), or any small VPS. One process handles many concurrent matches
(see PERFORMANCE.md); matches live in memory, so a restart ends running matches.

## CI/CD (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | every push / PR | typecheck, lint, format check, 62 tests, data/map validation, build, server benchmark report, headless-browser smoke test with screenshots (artifact), Docker build, secret scan; legacy C# job until that code is removed |
| `server-image.yml` | push to `main`, tags `v*` | builds and publishes `ghcr.io/<owner>/conflict-core` |
| `unity.yml`, `android-release.yml` | — | legacy Unity prototype workflows; inactive (no licence / disabled by variable) |

Branching: `main` (protected, PR + green CI), `develop`, `feature/*`, `fix/*`. Versions follow semver in
`package.json`; `PROTOCOL_VERSION` (shared/constants.ts) is bumped on any wire change so outdated browsers are
asked to reload instead of desyncing.

## Security notes

No secrets are needed to build or run the game. The server sends strict security headers (CSP, `nosniff`,
`frame-ancestors 'none'`, no referrer), validates every message, rate-limits connections and commands, and keeps
all authority server-side. Development tools are off unless `DEV_TOOLS=1`.
