# Performance

Performance is a feature with budgets, measured on devices — "it seems fast" is never a validation.

## Device tiers and targets

| Tier | Example class | Target | Default preset |
|---|---|---|---|
| Ultra | ≥ 11 GB RAM, current flagship SoC, tablets | 60 FPS | Ultra |
| High | 8 GB RAM flagship of the last ~3 years | 60 FPS | High |
| Medium | 4–6 GB mid-range | 30 FPS | Medium |
| Low | 3–4 GB, older GPU, no compute shaders | 30 FPS | Low |

Initial classification: `DeviceTierClassifier` (unit-tested). Phase 6 adds a runtime watchdog that steps down a
tier after sustained overruns, plus a device allow/deny list fed by telemetry.

Presets (`QualityProfiles`, single source of values) control: target FPS, render scale, shadow distance/cascades/
resolution, soft shadows, MSAA, post-processing, bloom, particle cap, LOD bias, terrain detail density and distance,
texture mip limit, reflection probes.

## Frame budgets

| Budget | Ultra/High (60 FPS = 16.7 ms) | Medium/Low (30 FPS = 33.3 ms) |
|---|---|---|
| Main thread CPU | ≤ 8 ms | ≤ 14 ms |
| — snapshot decode + interpolation | ≤ 1.0 ms | ≤ 1.5 ms |
| — unit presentation (300 units) | ≤ 2.0 ms | ≤ 3.5 ms |
| — UI | ≤ 1.0 ms | ≤ 2.0 ms |
| Render thread | ≤ 6 ms | ≤ 10 ms |
| GPU | ≤ 12 ms | ≤ 25 ms |
| SRP batches / draw calls | ≤ 250 | ≤ 150 |
| SetPass calls | ≤ 60 | ≤ 40 |
| Visible triangles | ≤ 600 k | ≤ 250 k |
| Active particles | ≤ 3 000–5 000 | ≤ 800–1 500 |
| Simultaneous audio voices | ≤ 32 | ≤ 24 |
| Managed allocations in a match (steady state) | **0 B/frame** | **0 B/frame** |
| GC spikes | none > 1 ms (incremental GC) | none > 2 ms |

## Memory budgets

| Budget | High/Ultra | Low/Medium |
|---|---|---|
| Total app resident | ≤ 1.3 GB | ≤ 750 MB |
| Textures | ≤ 450 MB | ≤ 220 MB (mip limit 1 on Low) |
| Meshes | ≤ 150 MB | ≤ 80 MB |
| Audio (compressed in memory, streamed music) | ≤ 60 MB | ≤ 40 MB |
| Managed heap | ≤ 150 MB | ≤ 100 MB |

## Simulation and network budgets

| Budget | Target |
|---|---|
| Server tick @ 300 units, 1v1 | ≤ 3 ms average, ≤ 10 ms p99 (66 ms available at 15 Hz) |
| Server memory per match | ≤ 150 MB |
| Path requests | time-sliced, ≤ 1 ms per tick |
| Simulated units per match (initial) | 300 (architecture extensible beyond) |
| Visible units on screen | 200 at High |
| Downstream bandwidth | ≤ 8 KB/s typical, ≤ 25 KB/s peak per client |
| Upstream bandwidth | ≤ 1 KB/s typical, ≤ 4 KB/s peak |

## Asset budgets (per unit at its LODs)

| Asset | LOD0 | LOD1 | LOD2 (normal RTS zoom) | LOD3 | Textures |
|---|---|---|---|---|---|
| Main battle tank / large vehicle | ≤ 15 k tris | ≤ 6 k | ≤ 2 k | ≤ 500 or impostor | 1–2 K atlas (BaseColor, Normal, MaskMap) |
| Light vehicle | ≤ 8 k | ≤ 3 k | ≤ 1 k | ≤ 300 | 1 K |
| Infantry (per soldier) | ≤ 4 k | ≤ 1.5 k | ≤ 500 | impostor/billboard | 512–1 K shared atlas |
| Structure | ≤ 25 k | ≤ 10 k | ≤ 3 k | ≤ 800 | 2 K max (hero), shared trim sheets |
| Props | ≤ 2 k | ≤ 600 | — | — | 256–512 atlas |

## Strategy (how budgets are met without making the game ugly)

* **No per-unit `Update()`**: centralised managers iterate packed arrays; simulation at 15 Hz, presentation
  interpolates.
* **LOD everywhere**: LOD0 for close-ups, LOD1/LOD2 at gameplay zoom, LOD3/impostors far away; LOD bias per tier.
* **Instancing & batching**: SRP Batcher-friendly shared shaders, GPU instancing / GPU Resident Drawer for repeated
  units, texture atlases and trim sheets, minimal shader variants (stripped by build preprocess).
* **Pooling**: projectiles, VFX, decals, audio sources, damage numbers, UI list items. Nothing is instantiated in
  combat.
* **VFX**: flipbook particles, short-lived debris, pre-authored destroyed meshes, decals with a cap; wreckage
  simplified then removed by rule (count and age caps).
* **Physics**: no rigid-body simulation for gameplay; analytic projectiles and kinematic movement.
* **Streaming**: Addressables for unit/map content, async loading during match load; memory-budget-aware unloads.
* **Culling**: frustum culling (engine) + cheap distance/fog culling of presentation for units out of view.
* **Audio**: voice limiting with priority, distance attenuation, one engine loop per unit group not per unit.
* **Jobs/Burst**: interpolation, visibility texture, and LOD selection jobs once profiling shows benefit.
* **Thermal**: 30 FPS mode available on all tiers; adaptive render scale on sustained thermal throttling.

## Measurement

* Benchmark map + automated scenarios: 10 / 50 / 100 / 200 / 300+ units, idle, moving, full combat (Phase 6).
* Metrics captured per scenario: FPS (avg, 1 % low), CPU main/render, GPU time, RAM, draw calls, triangles,
  particles, network bytes in/out, simulation tick time, pathfinding time.
* Tools: Unity Profiler (development builds connect automatically), Memory Profiler, Frame Debugger, Android GPU
  Inspector / Snapdragon Profiler / Arm Performance Studio, Xcode Instruments; server: `dotnet-counters`,
  `dotnet-trace`, tick-time logs (`MatchHostService` already logs worst step time).
* Results are recorded in `docs/benchmarks/` with device, build and date.

## Results

No device measurements yet (Phase 1). The first entries are expected with the Phase 6 benchmark.
