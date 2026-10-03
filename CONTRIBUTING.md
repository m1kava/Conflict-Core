# Contributing

## Workflow

1. Branch from `develop`: `feature/<short-name>` or `fix/<short-name>`.
2. Keep commits logically separated with clear messages (imperative mood: "Add flow field cache").
3. Before pushing, run:
   ```bash
   dotnet format ConflictCore.sln --verify-no-changes
   dotnet build ConflictCore.sln -c Release
   dotnet test ConflictCore.sln -c Release
   dotnet run --project Tools/ConflictCore.DataValidator -- Data
   ```
4. Open a PR into `develop` using the template. CI must be green; one approval required.
5. For every major feature: understand the current architecture → write the design (in the PR or `docs/`) →
   identify dependencies → implement the smallest clean version → tests → profile if performance-sensitive →
   verify mobile and multiplayer behaviour → update docs and status markers.

## Code conventions

* C#: `.editorconfig` is authoritative and enforced in CI (`dotnet format`, warnings as errors, nullable enabled).
* `Shared/` and `Client/` use **C# 9 with block-scoped namespaces** (Unity compiles them). .NET 8 projects use
  file-scoped namespaces and modern C#.
* Private fields `_camelCase`; constants and `static readonly` fields `PascalCase`.
* Small focused types and methods; no God classes; no files growing past ~400 lines without a reason.
* No magic numbers — name constants; **no balance values in code** (they belong in `Data/`).
* Composition over inheritance; explicit dependencies over singletons; no business logic in UI code.
* Comments explain *why*, not *what*. Complex systems get a doc comment describing the model and its trade-offs.
* No commented-out code, no TODOs without an issue reference.

### Simulation code (deterministic)

* Use `Fixed`, `FixedVector2`, `FixedMath`, `DeterministicRandom`. Never `float`, `double`, `System.Random`,
  `DateTime.Now`, `Dictionary`/`HashSet` iteration order, LINQ in hot paths, or parallel mutation of shared state.
* If golden-value tests change, the change must be intentional and documented (it invalidates old replays).

### Unity code

* MonoBehaviours are thin adapters; logic goes into `Scripts/Logic` (engine-free, unit-tested) or `Shared/`.
* No per-unit `Update()`; use central managers. No allocations per frame in gameplay.
* Avoid namespaces that collide with UnityEngine types (`Camera`, `Input`, `Terrain`).

### Networking

* Every wire change bumps `ProtocolInfo.Version` and adds tests (round-trip + malformed input).
* Every inbound field is bounded. Clients send intents, never results.

## Status markers

Docs and PRs mark systems as **IMPLEMENTED**, **PARTIAL**, **PLACEHOLDER** or **PLANNED**. Never present a mock or
placeholder as finished.

## Assets

Read [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md). Every third-party asset needs a licence entry before merge.
Binary assets go through Git LFS.

## Security

Never commit credentials, keystores or `.env` files. Report vulnerabilities privately to the maintainers.
