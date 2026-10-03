# Asset pipeline

Status: **PLANNED (Phase 7)** for production content. The repository currently contains **no production art**;
the only visuals are runtime-generated, explicitly labelled placeholders (`PlaceholderTerrainBuilder`).

## Sourcing and licensing rules

1. Only properly licensed assets: Unity Asset Store (Standard EULA), Fab, Sketchfab (CC-BY / CC0 / Standard),
   CGTrader (royalty-free), Poly Haven (CC0), Kenney/Quaternius (CC0, where the style fits), commissioned work, or
   in-house work.
2. **Never** import assets ripped from commercial games, "fan remakes" of existing game units, or anything whose
   licence forbids redistribution in a game build or modification.
3. Before an asset is merged, add a row to [ASSET_LICENSES.md](ASSET_LICENSES.md): asset, source URL, author,
   licence, usage rights, attribution text, date, who verified. CI checks (Phase 7) that every file under
   `Client/Assets/_Project/Art` is covered by an entry.
4. Attribution required by a licence is collected into the in-game credits screen.
5. A placeholder must be named `*_PLACEHOLDER*`, live under `Art/Placeholders/`, and have a replacement ticket.

## Folder structure (Unity)

```
Client/Assets/_Project/Art/
  Units/<Faction>/<Unit>/        Meshes (FBX), Textures, Materials, Prefab, LOD group
  Structures/<Faction>/<Name>/
  Environment/{Terrain,Props,Vegetation,Skies}/
  VFX/{Muzzle,Impact,Explosions,Trails,Smoke}/
  UI/{Icons,Portraits,HUD,Fonts}/
  Placeholders/
Client/Assets/_Project/Audio/{Weapons,Vehicles,Voice,UI,Ambience,Music}/
```

Addressable keys follow the definition references in `Data/` (e.g. `units/halcyon/mbt_lod0`), so content is
resolved from data, never from hard-coded paths.

## Modelling standards

* Real-world scale (1 unit = 1 m), +Y up, forward +Z; pivots at ground contact centre; turret and barrel as separate
  child transforms with pivots at the rotation axes (turret ring, trunnion).
* Correct military proportions, recognisable silhouettes from the RTS camera (top-down 45–60°).
* Tracks: shared track mesh with UV-scrolling material + road wheel rotation; suspension illusion via a few bones or
  vertex animation — no physics.
* Damage: intact / damaged (decals + emissive embers) / destroyed (pre-authored wreck mesh). Wrecks are pooled and
  removed by rule.
* LOD0–LOD3 per [PERFORMANCE.md](PERFORMANCE.md#asset-budgets-per-unit-at-its-lods); LOD3 may be a baked impostor.
* Collision: none on visual meshes; gameplay uses data-defined radii and footprints.

## Textures and materials

* PBR metallic workflow, URP Lit (or a shared custom lit shader with stripped variants): BaseColor, Normal,
  MaskMap (metallic, AO, detail mask, smoothness).
* Resolution by screen importance: hero/large ≤ 2 K, normal vehicles 1–2 K, small units 512–1 K, props 256–512.
  Never 4 K in the build.
* Faction/team colour via a mask channel and material property (no texture duplicates per team).
* Trim sheets and atlases for structures and props; material count per unit ≤ 2.
* Compression: ASTC (6×6 default, 4×4 for normals/UI where needed) on Android and iOS; mipmaps on for 3D.

## VFX and audio

* Pooled particle systems with per-tier particle caps; flipbook explosions and smoke; no real-time lights per
  explosion on Low/Medium.
* Audio: Vorbis/AAC compressed, streamed music; voice limits and priority classes (UI > alerts > weapons > ambience).

## Import automation (Phase 7)

`AssetPostprocessor` rules enforce: texture max size by folder, ASTC formats, mipmaps, read/write disabled, mesh
compression, no imported cameras/lights, required LOD group on unit/structure prefabs. A CI check (Unity batch
mode) reports violations.
