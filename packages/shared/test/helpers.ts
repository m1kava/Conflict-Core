import { getGameData, getMap, World, type Entity } from '../src/index';

export function createWorld(seed = 1): World {
  return new World({
    map: getMap('ashfall_crossing'),
    data: getGameData(),
    players: [
      { slot: 0, team: 0, faction: 'halcyon', name: 'Alpha' },
      { slot: 1, team: 1, faction: 'halcyon', name: 'Bravo' },
    ],
    seed,
  });
}

export function owned(world: World, slot: number, defId: string): Entity[] {
  return [...world.entities.values()].filter((e) => e.alive && e.owner === slot && e.defId === defId);
}

export function runTicks(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    world.step();
  }
}

/** Finds a walkable open spot near a point (for spawning test units). */
export function openSpot(world: World, x: number, y: number): { x: number; y: number } {
  return world.nav.nearestWalkable(x, y) ?? { x, y };
}
