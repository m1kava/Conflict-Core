# Roadmap

Development is vertical: each phase ends with something that runs, is tested and is documented. Content quantity
comes last; no new units before the multiplayer simulation is correct.

| Phase | Goal | Exit criteria | Status |
|---|---|---|---|
| **1 Foundation** | Repo, conventions, architecture, shared deterministic core, protocol skeleton, data pipeline, mobile input & camera, placeholder terrain, CI | CI green; Unity project imports and Bootstrap scene runs on an Android device with touch camera; first Unity CI run green | **In progress** — everything except on-device/Unity CI verification done |
| **2 RTS core** | Simulation library: world, selection, movement, pathfinding (grid + flow fields), formations, commands, basic tank, combat, health, destruction | 100 tanks path across a test map without jams; deterministic hash identical across runs; client renders a local (in-process server) simulation | Planned |
| **3 Base building** | Builder, placement validation, construction, supply economy, production queues, power | Build a base, harvest, produce units on the in-process server | Planned |
| **4 Multiplayer core** | UDP transport, handshake + ticket verification, command intake/validation, fog-filtered delta snapshots, interpolation, disconnect/reconnect, net conditioner tests | Two clients on different networks play on a cloud server; 250 ms + 5 % loss playable; reconnect after 10 s outage | Planned |
| **5 Complete test match** | One faction, 5–8 structures, 6–10 units, fog of war, win/loss, minimal professional HUD | Two remote players complete a full match | Planned |
| **6 Performance** | Benchmark map & automated scenarios (10–300+ units), LOD/pooling/instancing, path & network optimisation, memory | Budgets in PERFORMANCE.md met on reference devices; results documented | Planned |
| **7 Visual quality** | Licensed production assets, PBR, terrain, VFX, animation, audio, UI polish, asset import rules | Vertical slice looks shippable at RTS distance on High tier | Planned |
| **8 Factions** | Bastion Union and Sable Front, tech trees, abilities, superweapons, aircraft, balance simulator | Three factions with distinct mechanics; balance sims within targets | Planned |
| **9 Online platform** | Backend (auth, profiles, matchmaking, lobbies, results, ratings, history), DB migrations, fleet allocation, regions | Quick Match & private lobbies across two regions on staging | Planned |
| **10 Production** | Security review, device lab testing, crash reporting, analytics, staging/production rollout, store builds (Android, iOS) | Soft launch | Planned |

## Major technical risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Server CPU cost per match (authoritative sim, 300 units) | Hosting cost, match density | Medium | Fixed 15 Hz tick, SoA data, spatial hashing, time-sliced pathing; server tick budget tracked from Phase 2; allocation-free hot paths |
| Bandwidth spikes in large battles on mobile data | Rubber-banding, data usage | Medium | Interest management, delta + quantisation, priority/budgeted snapshots, events for projectiles; measured with net conditioner |
| Pathfinding traffic jams with large tank groups | Core feel | High | Flow fields per group, formation slots, separation steering, unit-size-aware spacing; dedicated Phase 2 test scenarios |
| Determinism regressions (needed for replays) | Replays/disputes break | Medium | Fixed-point only, golden-value tests in .NET **and** Unity EditMode, banned-API analyzers (PLANNED) |
| Mobile GPU/thermal limits vs. "realistic" visuals | Visual target missed or devices overheat | High | Budgets per tier, LOD/impostors, ASTC, shader variant control, 30 FPS mode, adaptive render scale; profile on low-end devices early |
| Touch controls for complex RTS micro | Player frustration | Medium | Engine-free gesture layer with tests, playtests from Phase 2, configurable thresholds, groups/army shortcuts |
| Unity licensing / CI activation | Blocked builds | Low–Medium | Engine-independent core; game-ci; licence documented in DEPLOYMENT.md |
| Asset licensing mistakes | Legal | Low | Licence register + CI coverage check, no ripped assets policy |
| Cheating (maphack, speedhack, packet tampering) | Competitive integrity | Medium | Server authority, interest-managed fog, command validation, rate limits, packet HMAC, server-reported results |
| Scope (three asymmetric factions, aircraft, superweapons) | Delays | High | Vertical slice first; one faction until Phase 8; data-driven content to scale production |
| Reconnect edge cases (IP change, duplicate commands) | Lost matches | Medium | Resume tokens + command sequence dedupe already in protocol; conditioner tests for outages |
