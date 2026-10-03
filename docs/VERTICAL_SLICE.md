# First vertical slice (MVP) specification

The first meaningful playable milestone (end of Phase 5, polished in Phase 7). "MVP" does not mean ugly: anything
shown is either production quality or explicitly labelled placeholder with a replacement plan.

## Scope

* **Players:** 2 real players on separate phones over the internet, server-authoritative.
* **Map:** 1 original map, *Ashfall Crossing* (1v1, 512 × 512 m): two plateau bases in opposite corners, a river
  valley with three crossings (central bridge = choke point, two fords on the flanks), one contested central
  ridge with high-ground vision, two expansion supply fields per side (one safe, one exposed), roads, ruined
  farmland, rocky outcrops. Terrain, props and vegetation within PERFORMANCE.md budgets.
* **Faction:** Halcyon Accord only (mirror match).
* **Units (8):** engineer, rifle squad, AT team, supply truck, recon vehicle, main battle tank, AA vehicle,
  self-propelled artillery (definitions in `Data/halcyon/units.json`).
* **Structures (7):** Command HQ (builds engineers), Power Plant, Supply Depot (truck drop-off, builds trucks),
  Barracks, Vehicle Plant, Guard Tower (anti-ground defense), Radar Uplink (minimap + tier-2 prerequisite).
* **Economy:** credits from supply fields via trucks; power supply/demand with low-power penalties.
* **Combat:** damage/armor matrix, turrets, projectiles/missiles/artillery, splash, veterancy, destruction with
  wrecks.
* **Fog of war:** unexplored / explored / visible, server-filtered.
* **Commands:** select (tap, double-tap, box, groups), move, attack, attack-move, stop, guard, rally point, place
  building, produce, repair, sell, queued waypoints, formations.
* **Win/loss:** all enemy production + HQ destroyed, or surrender; results screen with basic stats.
* **UI:** main menu (play, settings), private lobby with code (2 slots, ready state), loading screen, match HUD
  (resources, power, minimap, command card, production queue, selection panel, network indicator), pause/settings,
  results. Safe-area aware, phone and tablet layouts.
* **Robustness:** survives 250 ms RTT, 5 % loss, a 10 s outage with automatic reconnect.

## Out of scope for the slice

Accounts beyond guest, ranked matchmaking, other factions, aircraft, superweapons, campaign, cosmetics, iOS store
release (iOS build may be tested via TestFlight if signing is available).

## Acceptance criteria

1. Two testers in different cities complete three full matches without desync, crash or stuck units.
2. High-tier reference device: 60 FPS average, 1 % low ≥ 45 FPS with 150 units in combat; Low-tier: stable 30 FPS.
3. Downstream ≤ 25 KB/s peak per client during the largest battle.
4. No client-authoritative state anywhere (verified by code review and by a hostile-client test bot).
5. All assets listed in ASSET_LICENSES.md; no unlabelled placeholders.
