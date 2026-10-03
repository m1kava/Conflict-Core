# ADR 0004 — One C# codebase shared by Unity, server and tools

**Status:** Accepted (2026-10)

## Context

Protocol encoding, game data and (from Phase 2) the simulation must be identical on client and server. Copying
code or maintaining two implementations causes desyncs and drift.

## Decision

* `/Shared` contains .NET Standard 2.1 / C# 9 projects **and** Unity assembly definitions in the same folders.
  Unity imports `/Shared` as the local package `com.conflictcore.shared` (`file:../../Shared` in
  `Client/Packages/manifest.json`); .NET projects reference the `.csproj` files.
* The dotnet build pins `LangVersion 9.0` / `netstandard2.1` for Shared so code that Unity cannot compile fails in
  CI first. Build output is redirected to `/artifacts` so no `bin/obj` folders appear inside the Unity package.
* Engine-free client logic lives in `Client/Assets/_Project/Scripts/Logic` (asmdef with `noEngineReferences`) and is
  compiled for tests by `Client/DotNet/ConflictCore.Client.Logic.csproj`.
* Newtonsoft.Json is the JSON library for shared code because Unity ships it as an official package; IL2CPP
  stripping is handled with `Assets/link.xml`.

## Consequences

* (+) One implementation, tested once in fast .NET CI and once more under Unity (EditMode determinism tests).
* (−) Shared code is limited to C# 9 APIs available in .NET Standard 2.1.
* (−) Unity generates `.meta` files inside `/Shared` on first import; they must be committed.
