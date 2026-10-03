# Roadmap

Development is vertical: each milestone ends with something playable, tested and documented.

| Milestone | Scope | Status |
|---|---|---|
| **1 Foundation** | Repository, conventions, architecture, shared data/protocol, CI | **Done** (re-platformed to browser/TypeScript, ADR 0005) |
| **2 RTS core** | Selection, movement, pathfinding, formations, commands, combat, destruction | **Done** |
| **3 Base building** | Engineers, placement, construction, supply economy, production, power | **Done** |
| **4 Multiplayer core** | Authoritative server, protocol, fog-filtered snapshots, reconnect, validation | **Done** |
| **5 Complete match** | One faction, 7 structures, 8 units, fog of war, win/loss, HUD, AI | **Done — playable** |
| **6 Performance** | Benchmarks (10–400 units), snapshot deltas, instancing, pooling | **Mostly done**: server and bandwidth budgets met; real-device FPS profiling and unit LODs open |
| **7 Visual & audio quality** | Procedural models, terrain, effects, procedural sound | **First pass done**; next: more model detail, animated tracks/infantry, music, building damage states |
| **8 Factions** | Bastion Union, Sable Front, tech upgrades, abilities, aircraft, superweapons, balance simulator | Planned |
| **9 Online platform** | Accounts, rankings, match history, multi-server matchmaking (BACKEND.md) | Planned |
| **10 Production** | Security review, device lab testing, crash reporting, analytics (privacy-respecting), public hosting | Planned |

Next concrete steps (in order): real-device performance pass on a mid-range phone; network conditioner tests
(latency/loss/jitter); second map; aircraft layer; Bastion Union faction; replay recording.

## Risks

| Risk | Mitigation |
|---|---|
| Low-end phones struggle with WebGL at large battles | Quality presets (Low disables shadows, lowers resolution and vegetation), instancing, particle caps; device profiling is the next step |
| Server cost with many simultaneous matches | 1.6 ms per tick at 300 units → dozens of matches per core; matches are independent and can be spread over processes |
| Network quality on mobile | Small field-delta snapshots, reconnect with full resync and command resend; conditioner tests planned |
| Cheating | Server authority, fog by omission, strict validation and rate limits; no client-side game state is trusted |
| Free hosting sleeps when idle | Documented; any always-on host can run the same container |
| Scope (three asymmetric factions, aircraft) | Data-driven content and one complete faction first |
