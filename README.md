# Conflict Core

A server-authoritative, online multiplayer **3D real-time strategy game for Android and iOS**, built to deliver the
depth of classic PC military RTS — base building, economy, power, combined-arms armies, tech progression,
superweapons — redesigned for touchscreens. All factions, units, maps, art and audio are original.

> **Project status: Phase 1 — Foundation (in progress).** Nothing is playable yet. See
> [docs/ROADMAP.md](docs/ROADMAP.md) and the status table in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#implementation-status).
> Every system is marked **IMPLEMENTED**, **PARTIAL**, **PLACEHOLDER** or **PLANNED** — placeholders are never presented as final.

## Technology stack

| Layer | Technology | Why (details in [ARCHITECTURE.md](docs/ARCHITECTURE.md)) |
|---|---|---|
| Client | **Unity 6 LTS**, URP, Input System, Addressables, Burst/Jobs | Best-in-class Android/iOS support, scalable PBR renderer, profilers, C# shared with the server |
| Shared code | **C# 9 / .NET Standard 2.1** | Deterministic fixed-point math, protocol, game data — compiled by Unity *and* .NET |
| Match server | **.NET 8** headless console app, Docker | Server-authoritative simulation; one disposable process per match |
| Backend (Phase 9) | ASP.NET Core, PostgreSQL, Redis, Kubernetes + Agones | Accounts, matchmaking, lobbies, results, fleet allocation |
| CI/CD | GitHub Actions, game-ci, GHCR | Build/test/lint on every PR, Android APK/AAB, server images |

## Repository layout

```
Client/            Unity project (Assets/_Project/Scripts/{Logic,Runtime,Editor}, Tests)
  DotNet/          csproj that compiles the engine-free client logic for CI tests
Shared/            Unity package "com.conflictcore.shared" + .NET projects
  ConflictCore.Core/       fixed-point math, deterministic RNG, ids, state hashing
  ConflictCore.Protocol/   wire format, handshake, versioning, command encoding
  ConflictCore.GameData/   data-driven definitions, JSON loader, validator
Server/            Dedicated match server (.NET 8) + Dockerfile
Data/              Game balance & content definitions (JSON) — no balance values in code
Tools/             Data validator (and future content/benchmark tools)
Tests/             xUnit test projects
docs/              Architecture, networking, gameplay, performance, deployment, ADRs
.github/           CI workflows, PR template, CODEOWNERS, Dependabot
```

## Getting started

### Prerequisites

* .NET SDK 8.0 (see `global.json`)
* Unity **6000.0 LTS** (version pinned in `Client/ProjectSettings/ProjectVersion.txt`) with Android Build Support
  (and iOS Build Support on macOS) — only needed for the client
* Git LFS (`git lfs install`) — binary assets are stored in LFS
* Docker — optional, for building the server image

### Clone

```bash
git clone https://github.com/m1kava/Conflict-Core.git
cd Conflict-Core
git lfs pull
```

### Configure

No secrets are needed for local development. Server settings live in
`Server/ConflictCore.Server/appsettings.json` and can be overridden with environment variables
(`MatchServer__Port=7778`) or command-line arguments (`--MatchServer:TickRate=20`).

### Build and test everything that does not need Unity

```bash
dotnet build ConflictCore.sln
dotnet test ConflictCore.sln
dotnet format ConflictCore.sln --verify-no-changes   # style gate used by CI
dotnet run --project Tools/ConflictCore.DataValidator -- Data
```

### Run the match server locally

```bash
dotnet run --project Server/ConflictCore.Server -- --MatchServer:DataDirectory=Data
# or
docker build -f Server/Dockerfile -t conflictcore/match-server:dev .
docker run --rm -p 7777:7777/udp conflictcore/match-server:dev
```

Phase 1 status: the server loads and validates game data and runs the fixed-tick loop with a placeholder
simulation. Networking arrives in Phase 4.

### Run the client

1. Open `Client/` in Unity Hub with the pinned Unity 6 version (first import takes a while).
2. Run **Conflict Core → Apply Project Setup** (creates the URP mobile pipeline asset, the Bootstrap scene and
   player settings). Restart the editor when asked (input handling switch).
3. Open `Assets/_Project/Scenes/Bootstrap.unity` and press Play. Mouse drag simulates touch; the sandbox shows
   placeholder terrain with the RTS camera (drag to pan with inertia; pinch/twist on device).

### Run client tests

* Engine-free logic: included in `dotnet test` above.
* Unity EditMode tests: *Window → General → Test Runner → EditMode → Run All*.

### Build Android

* **Locally:** *File → Build Profiles → Android*, or batch mode:
  ```bash
  Unity -batchmode -quit -projectPath Client \
    -executeMethod ConflictCore.Client.Editor.BuildScript.BuildAndroid \
    -customBuildPath Builds/Android/ConflictCore.apk -developmentBuild
  ```
* **CI:** the *Unity Client* workflow builds a development APK on pushes to `develop`/`main` once the
  `UNITY_LICENSE`, `UNITY_EMAIL`, `UNITY_PASSWORD` secrets exist. Tagging `vX.Y.Z` runs *Android Release*, which
  builds a signed AAB in the protected `production` environment. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## How deployment works

Pull requests run CI (format, build, tests, data validation, server image build, secret scan). Merges to
`develop` publish a `:develop` server image; merges to `main` publish `:main`; version tags publish `:X.Y.Z` and a
signed Android bundle. Promotion to staging/production fleets is gated by GitHub Environments with required
reviewers (fleet rollout jobs are PLANNED for Phase 9/10). Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture proposal, engine choice, diagrams, module boundaries, status |
| [NETWORKING.md](docs/NETWORKING.md) | Server-authoritative model, protocol, snapshots, fog, reconnect, anti-cheat |
| [GAMEPLAY.md](docs/GAMEPLAY.md) | Factions, units, economy, combat model, mobile controls |
| [BACKEND.md](docs/BACKEND.md) | Backend services, matchmaking, accounts, database schema |
| [PERFORMANCE.md](docs/PERFORMANCE.md) | Mobile performance strategy and budgets |
| [ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | Asset sourcing, licensing, LODs, textures, import rules |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | CI/CD, environments, secrets, versioning, release flow |
| [ROADMAP.md](docs/ROADMAP.md) | Phases, milestones, risks |
| [VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md) | First playable milestone specification |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branching, coding conventions, review rules |
| [docs/adr/](docs/adr) | Architecture decision records |
