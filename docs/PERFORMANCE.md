# Performance

Performance is a feature with budgets and measurements; "it seems fast" is not a validation.

## Server budgets and measurements

Measured with `npm run benchmark` (scripted battle on Ashfall Crossing, both armies attack-moving into each other
for 60 s; Node 22, 4-core cloud container, single match):

| Units total | Avg tick (ms) | p99 tick (ms) | Worst tick (ms) | Avg download (KB/s per player) | Peak (KB/s) |
|---|---|---|---|---|---|
| 10 | 0.20 | 1.13 | 37.53* | 0.4 | 0.9 |
| 50 | 0.29 | 2.26 | 8.02 | 1.7 | 3.3 |
| 100 | 0.55 | 6.80 | 10.01 | 3.2 | 6.4 |
| 200 | 1.36 | 9.41 | 11.46 | 6.2 | 13.7 |
| 300 | 1.59 | 8.35 | 21.64 | 10.1 | 20.4 |
| 400 | 1.95 | 7.76 | 12.35 | 14.4 | 26.8 |

Download includes binary snapshots and JSON gameplay events for one player.

\* first-tick JIT warm-up.

| Budget | Target | Status |
|---|---|---|
| Average tick at 300 units | ≤ 3 ms (of 66 ms available at 15 Hz) | **met** (1.6 ms) |
| p99 tick at 300 units | ≤ 15 ms | **met** (8.4 ms) |
| Download per player, 300-unit battle | avg ≤ 12 KB/s, peak ≤ 25 KB/s | **met** (10.1 / 20.4 KB/s) |
| AI-vs-AI full match | — | 15 min of game time simulated in ~1.7 s |

Unit model budgets are enforced by a test (`packages/client/test/models.test.ts`): main battle tank 2,432
triangles, other vehicles 1.1–1.9 k, soldiers 360 each.

Main techniques: work-budgeted A* (node expansions per tick) with path sharing for groups, spatial hash for
neighbour/target/splash queries, vision stamping with cached circle offsets every 2nd tick, field-level snapshot
deltas (idle entities cost zero bytes), event-based projectiles (one message per shot instead of per-tick
positions), compact tuple-encoded events, one event per hitscan burst (the client expands the burst from weapon data).

## Client budgets

Measured in a 200-unit battle (F3 overlay, 1600×900, incl. shadow pass): **High — 51 draw calls, 726 k triangles;
Low — 33 draw calls, 303 k triangles.**

| Budget | High (60 FPS) | Low (30 FPS) |
|---|---|---|
| Draw calls | ≤ 250 | ≤ 150 |
| Visible triangles | ≤ 1 M | ≤ 350 k |
| Active particles | ≤ 3 000 | ≤ 900 |
| Pixel ratio | ≤ 1.75 | 0.75 |
| Shadows | 2048 map | off |
| Per-frame allocations in a match | near zero (pooled effects, preallocated matrices) | same |

Quality presets (`packages/client/src/render/quality.ts`): Low / Medium / High / Ultra control pixel ratio,
antialiasing, shadows and shadow-map size, terrain mesh resolution, vegetation density, particle caps and
explosion lights. The default is chosen from device memory, CPU cores and touch input; players can change it.

Techniques: one `InstancedMesh` per unit-model part so draw calls stay flat as armies grow; static vegetation and
rocks are instanced; particles in two pooled layers (one draw call each); tracers in one line buffer; decals in one
instanced mesh; fog of war as a 80×80 texture sampled in shaders; terrain from a single indexed mesh; procedural
textures generated once.

Press **F3** in a match for FPS, draw calls, triangles, entities, particles, ping, tick lag and download rate.

## Not yet measured

Frame rates on real phones and tablets have not been profiled yet (the CI browser test uses software rendering,
which is not representative). Unit LOD switching and an adaptive quality watchdog are planned if device testing
shows the need.
