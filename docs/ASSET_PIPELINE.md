# Asset pipeline

## Current approach: everything is generated from code

The game ships **no downloaded or third-party art or audio**. All visuals and sounds are created procedurally
by original code in this repository, which means there are no licences to track and nothing to pay for:

| Asset type | How it is produced | Where |
|---|---|---|
| Unit models (tank, recon, AA, artillery, truck, infantry) | Assembled from extruded profiles, bevelled boxes, cylinders and lathe shapes into one vertex-coloured mesh per part (hull, turret, team markings) | `packages/client/src/render/models/units.ts` |
| Structure models | Same builder; moving parts (radar dish, tower turret) are separate meshes | `render/models/buildings.ts` |
| Terrain | Mesh from the shared analytic height function; vertex colours by slope, height, roads, river banks, base areas; tiling procedural detail texture | `render/terrainMesh.ts` |
| Vegetation, rocks, water, bridge | Instanced procedural meshes, seeded placement from map data | `render/environment.ts` |
| Textures (detail, panel wear, smoke, scorch, glow) | Generated on canvases at start-up (seamless noise) | `render/textures.ts` |
| Effects | GPU point sprites, line tracers, instanced decals | `render/effects.ts`, `render/particles.ts` |
| UI icons | Original line-art SVG paths in code | `ui/icons.ts` |
| Sound | Synthesised with WebAudio (filtered noise, oscillators, envelopes) | `audio/sound.ts` |

Modelling conventions: metres, +Y up, models face +X (the simulation heading maps directly to a rotation about Y),
turret pivots at the turret ring. Team colour is applied through separate "team" geometry rendered with a per-instance
colour, so one model serves every player.

Budgets per model (current): main battle tank ≈ 3 k triangles, infantry soldier ≈ 0.6 k, largest structure ≈ 6 k.
Because units are instanced, draw calls do not grow with army size.

## Upgrading to authored models later

If authored models are added (e.g. glTF from Blender or CC0 sources), follow these rules:

1. Only original work or assets with a licence that permits redistribution in a game (CC0, CC-BY with attribution,
   or a purchased/commissioned licence). Never assets ripped from commercial games.
2. Record each asset in [ASSET_LICENSES.md](ASSET_LICENSES.md) before merging (source, author, licence, attribution).
3. Keep the part split (hull / turret / team mask) and the +X-forward convention so the instanced renderer and
   turret logic keep working; provide LOD0–LOD2 for vehicles; textures ≤ 1 K for units, ≤ 2 K for structures,
   compressed (KTX2/Basis) for the web.
4. Load through a single model registry keyed by the `model` field in `packages/shared/data/*.json`.
