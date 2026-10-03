import type { World } from './world';

/** Mixed army composition used by benchmarks and the dev battle scenario (fractions sum to 1). */
const COMPOSITION: [string, number][] = [
  ['halcyon_mbt', 0.38],
  ['halcyon_rifle_squad', 0.2],
  ['halcyon_at_team', 0.15],
  ['halcyon_recon_vehicle', 0.1],
  ['halcyon_aa_vehicle', 0.09],
  ['halcyon_spg', 0.08],
];

/**
 * Benchmark / test scenario: each of the first two players gets `unitsPerSide` mixed units on their side of
 * the central bridge, ordered to attack-move to the enemy base, so the armies collide mid-map. Only ever used
 * by tests, the benchmark tool and servers started with DEV_TOOLS=1 — never in normal matches.
 */
export function setupBattleScenario(world: World, unitsPerSide: number): void {
  const map = world.map;
  const anchors = [
    { x: map.width / 2 - 42, y: map.height / 2 - 42 },
    { x: map.width / 2 + 42, y: map.height / 2 + 42 },
  ];
  for (let side = 0; side < 2; side++) {
    const player = world.player(side);
    const anchor = anchors[side]!;
    const enemySpawn = map.spawns[1 - side]!;
    if (!player) {
      continue;
    }
    player.credits += 20000;
    const ids: number[] = [];
    let spawned = 0;
    for (const [defId, share] of COMPOSITION) {
      const count = Math.max(1, Math.round(unitsPerSide * share));
      for (let i = 0; i < count && spawned < unitsPerSide; i++, spawned++) {
        const columns = Math.ceil(Math.sqrt(unitsPerSide));
        const gx = (spawned % columns) - columns / 2;
        const gy = Math.floor(spawned / columns);
        // Rows extend away from the river (south-west for side 0, north-east for side 1).
        const back = side === 0 ? -1 : 1;
        const spot = world.nav.nearestWalkable(anchor.x + (gx + gy * back) * 3, anchor.y + (-gx + gy * back) * 3, 30);
        if (!spot) {
          continue;
        }
        const unit = world.spawnUnit(defId, side, spot.x, spot.y, side === 0 ? Math.PI / 4 : (Math.PI * 5) / 4);
        ids.push(unit.id);
      }
    }
    for (let i = 0; i < ids.length; i += 200) {
      world.issue(side, { type: 'attackMove', units: ids.slice(i, i + 200), x: enemySpawn.x, y: enemySpawn.y });
    }
  }
}
