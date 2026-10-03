# Shared

Engine-independent C# shared by the Unity client (`/Client`), the dedicated match server (`/Server`) and tools.

* Every project here targets **.NET Standard 2.1 / C# 9** (`ConflictCoreUnityCompatible=true`), the profile Unity compiles.
* Every project folder also contains a Unity **`.asmdef`**, so Unity imports this folder as the local package
  `com.conflictcore.shared` (see `Client/Packages/manifest.json`).
* No `UnityEngine` references. No `float`/`double` in simulation-relevant code — use `Fixed`.
* dotnet build output goes to `/artifacts`, never into these folders.
