/**
 * CI data gate: validates all game data and maps, prints a summary and the content hash.
 * Exits non-zero (with GitHub annotations) on any problem. `npm run validate-data`
 */
import combat from '../data/combat.json';
import halcyon from '../data/halcyon.json';
import { getGameData, MAPS, Terrain, validateGameData, type CombatDataFile, type FactionDataFile } from '../src/index';

const issues = validateGameData(combat as CombatDataFile, [halcyon as FactionDataFile]);
for (const map of MAPS) {
  const terrain = new Terrain(map);
  map.spawns.forEach((spawn, i) => {
    const cx = Math.floor(spawn.x / 2);
    const cy = Math.floor(spawn.y / 2);
    if (terrain.isTerrainBlocked(cx, cy)) {
      issues.push(`map ${map.id}: spawn ${i} is on impassable terrain.`);
    }
  });
  map.supplyFields.forEach((field, i) => {
    if (terrain.isTerrainBlocked(Math.floor(field.x / 2), Math.floor(field.y / 2))) {
      issues.push(`map ${map.id}: supply field ${i} is on impassable terrain.`);
    }
  });
}

if (issues.length > 0) {
  for (const issue of issues) {
    console.log(`::error title=Game data::${issue}`);
  }
  console.error(`Game data invalid: ${issues.length} issue(s).`);
  process.exit(1);
}
const data = getGameData();
console.log(
  `Game data OK: ${data.factions.size} faction(s), ${data.units.size} units, ${data.buildings.size} structures, ` +
    `${data.weapons.size} weapons, ${MAPS.length} map(s). Content hash ${data.contentHash}.`,
);
