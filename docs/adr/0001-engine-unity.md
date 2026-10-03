# ADR 0001 — Unity 6 LTS with URP for the client

**Status:** Accepted (2026-10)

## Context

The game must look like a modern PC RTS on phones, run 60 FPS on high-end and 30 FPS on lower-end devices, ship
on Android and iOS, support hundreds of units, have strong profiling, and be buildable in GitHub Actions.

## Decision

Use **Unity 6 LTS** with the **Universal Render Pipeline**, Input System, Addressables, Burst/Jobs where profiling
justifies it, and game-ci for CI builds.

## Alternatives considered

* **Unreal Engine 5** — best-in-class high-end rendering and tooling, but its mobile path loses Lumen/Nanite on
  most phones, binaries and baseline GPU cost are heavier, iteration in C++ is slower, and sharing the simulation
  with a lightweight dedicated server means maintaining C++ server builds of the engine.
* **Godot 4** — open source and CI-friendly, but the mobile renderer and C# mobile export are younger, profiling
  and the asset ecosystem are weaker, and mobile realistic rendering at RTS scale would need more engine work.
* **Custom engine** — maximum control, unaffordable scope.

## Consequences

* (+) Mature Android/iOS pipelines, ASTC, Vulkan/Metal, SRP Batcher, GPU instancing, LOD groups, profilers.
* (+) C# lets the exact simulation/protocol source run on a plain .NET 8 server (ADR 0004).
* (−) Closed source; licence terms apply above revenue thresholds; CI needs a licence secret.
* (−) URP mobile looks premium only with disciplined budgets and art direction — addressed in PERFORMANCE.md and
  ASSET_PIPELINE.md.
* Mitigation for engine risk: gameplay simulation, protocol and most client logic are engine-independent.
