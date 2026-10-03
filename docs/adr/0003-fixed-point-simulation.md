# ADR 0003 — Deterministic fixed-point simulation

**Status:** Accepted (2026-10)

## Context

Even with a single authoritative server (ADR 0002), determinism is valuable: replays from command logs, exact
reproduction of bug reports, re-simulation for dispute/cheat review, golden regression tests, and optional future
client prediction. IEEE floats are deterministic on one binary but not reliably across compilers, JIT/AOT
(IL2CPP), CPU architectures (x64 server vs ARM64 phones) and math library implementations.

## Decision

* All simulation math uses `Fixed` (Q47.16 in a 64-bit integer), `FixedVector2`, and integer-only `FixedMath`
  (sqrt by integer square root; sin/cos/atan2 by fixed polynomials).
* Randomness from `DeterministicRandom` (PCG32) seeded per match; state is two `ulong`s and is snapshot-able.
* Authored data is parsed through `decimal` → `Fixed` (never through `double`).
* Ordered iteration only (dense arrays, sorted ids); no wall-clock time in simulation.
* Golden-value tests (`GoldenChecksums`) run in .NET and in Unity EditMode; any change is intentional and versioned.

## Consequences

* (+) Bit-identical results on server, phones, tools and tests.
* (−) Slightly more verbose math; Q16 precision (1.5e-5) is ample for metres/seconds, but very small accumulations
  must be designed carefully (e.g. multiply before divide).
* (−) Trig accuracy ≈ 1e-4 rad — far below anything visible or gameplay-relevant.
