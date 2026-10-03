# Gameplay design

Original game design inspired by the *style* of classic modern-military PC RTS (fast, strategic matches; base
building; power economy; hard counters; tech; superweapons). No names, units, maps, art or audio from existing
games are used.

Status: the Halcyon Accord, the economy, construction, production, combat, veterancy, fog of war, the AI and the
controls below are implemented and playable. Other factions, aircraft and superweapons are designed but not yet
implemented. All balance values live in `packages/shared/data/*.json`.

## Match structure

* 10–30 minute matches; 1v1 first, architecture supports up to 8 players (2v2…4v4, FFA, co-op vs bots).
* Victory: a player is defeated when they have no **critical structures** (HQ, Supply Depot, Barracks, Vehicle
  Plant — finished or under construction) and no engineers left. Surrender is a command. The server decides.
* Starting state: Command HQ, one engineer and 3,000 credits (data-driven per faction).

## Economy

| Resource | Source | Spent on |
|---|---|---|
| **Credits** | Supply trucks haul 150 credits per trip from finite **supply fields** to a Supply Depot (each depot comes with one truck) | Units and structures; production is paid when queued and refunded on cancel; selling refunds 50 % |
| **Power** | HQ (+5), Power Plants (+10); other structures consume | Not spent: if demand > supply, production runs at half speed, Guard Towers go offline and radar shuts down |
| **Tech cores** *(PLANNED, Phase 8)* | Late-game capture points / research structures | Top-tier upgrades and superweapons |

Design intent: expansions to richer supply fields are strategically necessary but exposed; trucks are the classic
harassment target; power plants are high-value targets that create comeback windows.

## Combat model

* **Damage types × armor types** — complete matrix in `Data/core/combat.json`
  (small_arms, autocannon, armor_piercing, high_explosive, anti_air × infantry, light_vehicle, heavy_vehicle,
  structure, aircraft). Every combination is explicit and validated.
* **Weapons** — delivery: hitscan (MGs, autocannons), projectile (tank shells, rockets), missile (homing, with turn
  rate), ballistic (artillery with minimum range and impact delay). Burst fire, reload, accuracy, splash with
  edge falloff, suppression, friendly-fire flag, target layers (ground/air/structure).
* **Turrets** — turreted mounts rotate independently (traverse rate in data) so tanks can fire on the move;
  hull-fixed weapons require facing.
* **Suppression** *(PLANNED)* — infantry under heavy fire move/fire slower; recovers over time.
* **Terrain** *(PLANNED)* — high ground grants vision/range bonus and accuracy penalty for attackers below;
  forests/buildings block line of sight; roads give speed bonus to wheeled units.
* **Veterancy** — Recruit → Veteran → Elite → Heroic. XP from damage dealt/kills, proportional to victim cost;
  thresholds are multiples of the unit's own cost. Bonuses (damage, reload, accuracy, health, speed,
  regeneration) are data-driven.

## Factions

### Halcyon Accord — *precision and information* (vertical-slice faction)

A coalition of technocratic city-states fielding a small, expensive, networked professional force. Wins by
seeing first and striking precisely: superior radar and drones, long-range guided weapons, strong air power,
excellent upgrades. Weak to attrition and mass; every lost unit hurts.

* Visual language: clean angular composite armor, desert-sand and slate-grey palettes with teal identification
  strips, sensor masts, enclosed RWS turrets.
* Signature mechanics: *Uplink* (units near a Relay Tower share vision and get accuracy bonuses), recon drones,
  laser-designated strikes.
* Late game *(PLANNED)*: **Lance Array** — orbital kinetic strike: single-point, very high damage, long cooldown.

### Bastion Union — *mass, armor and fortification* (Phase 8)

An industrial bloc whose doctrine is to grind forward behind artillery and the heaviest armor on the field.
Slow, durable, power-hungry; dominates set-piece battles, struggles against mobility and air.

* Visual language: heavy cast-steel hulls, olive and rust, exposed rivets, massive tracks, smokestacks.
* Signature mechanics: fortified bunkers infantry can garrison, field repair crawlers, artillery spotting,
  production overdrive (temporarily faster production at power cost).
* Late game *(PLANNED)*: **Thunderhead Battery** — saturation rocket barrage over a wide area.

### Sable Front — *mobility, deception, ambush* (Phase 8)

A loose alliance of militias and contractors who cannot win head-on and never try. Cheap infantry, fast
improvised vehicles, structures that pack up and relocate, stealth and decoys.

* Visual language: civilian-chassis conversions, camouflage netting, mismatched paint, sand and ochre.
* Signature mechanics: mobile production (deployable trucks), camouflage nets (stealth when stationary),
  decoy units, ambush bonus on first volley from stealth, rapid expansion with cheap forward depots.
* Late game *(PLANNED)*: **Blackout Package** — disables enemy power and radar in an area for a short time.

Factions must differ in *how they play*, not just in stats; each gets unique mechanics, not re-skins.

## Unit classes (data enum `UnitClass`)

Infantry · LightVehicle · HeavyVehicle · MainBattleTank · TankDestroyer · AntiAir · Artillery · RocketArtillery ·
SupportVehicle · Transport · Helicopter · JetAircraft · Bomber · Drone · Builder · Harvester · Special

### Halcyon roster (playable, first-pass balance)

| Id | Class | Role | Counter-play |
|---|---|---|---|
| `halcyon_engineer` | Builder | Constructs, repairs, captures | Fragile, high-value target |
| `halcyon_rifle_squad` | Infantry | Anti-infantry, garrison, capture | Shredded by autocannons/HE |
| `halcyon_at_team` | Infantry | Guided anti-tank missiles | Weak vs infantry |
| `halcyon_supply_truck` | Harvester | Hauls credits | Harassment target |
| `halcyon_recon_vehicle` | LightVehicle | Scout, detector, anti-light, anti-air backup | Dies to AT and tanks |
| `halcyon_mbt` | MainBattleTank | Line armor, fires on the move | AT infantry, air |
| `halcyon_aa_vehicle` | AntiAir | SAM + autocannon air denial | Ground armor |
| `halcyon_spg` | Artillery | Long-range HE, minimum range | Fast raiders |

| Structure | Role | Power | Cost |
|---|---|---|---|
| Command HQ | Starting base, trains engineers | +5 | — |
| Power Plant | Power | +10 | 600 |
| Supply Depot | Truck drop-off, trains trucks, comes with one truck | −1 | 1000 |
| Barracks | Infantry (rifle squad, AT team, engineer) | −2 | 500 |
| Vehicle Plant | Recon, MBT, AA, SPG (needs Supply Depot) | −3 | 1600 |
| Guard Tower | Autocannon + ATGM defence (needs Barracks) | −1 | 700 |
| Radar Uplink | Minimap enemy contacts; unlocks AA and SPG (needs Barracks) | −4 | 1000 |

## Commands

Move · Attack · Attack-move · Stop · Hold position · Guard · Patrol · Repair · Enter/Exit transport (Unload) ·
Capture · Use ability · Place building · Queue/cancel production · Rally point · Sell · Research · Toggle power ·
Surrender. Any order can be **queued** as a waypoint. Group moves use **formations** (auto, grid, line, wedge,
spread) with spacing from each unit's `movement.radius`. Encoded in `Shared/ConflictCore.Protocol/Commands`.

## Aircraft *(Phase 8 design)*

* **Helicopters**: hover, strafe, can hold position, land at helipads to repair/rearm.
* **Jets**: cannot hover — fly attack runs with a turn radius, circle when idle, return to their airfield when out of
  ammunition, rearm on a pad (one aircraft per pad). Air-to-air and air-to-ground weapons are separate mounts.
* Air units ignore ground pathing but obey map air bounds; anti-air coverage defines no-fly zones.

## Building placement

Valid/invalid preview tinted on the footprint; checks: terrain slope/height variance, collisions with units and
structures, construction radius from existing structures, map bounds, not under fog-unexplored areas. 90° rotation
steps. Mobile flow: pick structure → ghost follows the screen centre (thumb-friendly), drag to adjust,
rotate button, confirm/cancel buttons; a builder walks there and constructs (construction animation, scaffolding,
damage states, destruction).

## Mobile controls

Designed for thumbs on a 6" landscape phone first, then scaled up for tablets.

| Gesture | Action |
|---|---|
| One-finger drag | Pan camera (finger-locked, inertia on release) |
| Pinch / two-finger twist | Zoom / rotate (rotation optional in settings) |
| Tap own unit/building | Select |
| Tap ground (with units selected) | Move in formation |
| Tap enemy (with units selected) | Attack |
| Double-tap unit | Select all visible units of that type |
| Press and hold, then drag | Box selection |
| Press and hold, release | Attack-move to that point |
| Tap own damaged/unfinished structure with engineers | Repair / resume construction |
| Tap supply field with trucks selected | Harvest |
| Right-edge buttons | Select all combat units · attack-move toggle · clear selection |

Desktop: left-click select (Shift adds), drag a box, double-click selects all visible of a type, right-click gives
the context order (move / attack / harvest / repair / rally), right-drag pans, wheel zooms, Q/E or middle-drag
rotates, arrows and screen edges scroll, `A` + click attack-moves, `S`/`H`/`G` stop/hold/guard, `Ctrl+1–9`
assigns groups, `1–9` recalls (double press centres), Space centres on base, structure and unit hotkeys are shown
on the command card. Touch: as in the table above; the right-edge buttons select the army, toggle attack-move and
clear the selection; building placement shows Rotate / Build here / Cancel buttons.

The HUD keeps resources and power top-left, network status top-right, minimap bottom-left, selection panel
bottom-centre and command card bottom-right, inside the device safe area (notches, home indicators).

## Balance workflow

1. Edit JSON in `Data/` (never code).
2. `dotnet run --project Tools/ConflictCore.DataValidator -- Data` (also runs in CI).
3. The content hash changes → old clients are rejected by servers running new data (and vice versa), which is the
   intended behaviour.
4. `npm run simulate` plays AI-vs-AI matches on the real simulation; `npm run benchmark` runs scripted battles.
   A dedicated balance simulator (time-to-kill and cost efficiency per matchup) is planned.
