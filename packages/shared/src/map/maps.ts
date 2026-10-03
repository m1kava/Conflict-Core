import type { MapDef } from './mapDef';

const SIZE = 320;
const QUARTER = Math.PI / 4;

/** Rotates a point 180° around the map centre: maps are rotationally symmetric for fair 1v1. */
function mirror<T extends { x: number; y: number }>(item: T): T {
  return { ...item, x: SIZE - item.x, y: SIZE - item.y };
}

/**
 * Ashfall Crossing — original 1v1 map. Two plateau bases in opposite corners, a river valley between them
 * with a central bridge (choke point) and two flanking fords, exposed expansion fields on each side, hills
 * for high-ground vision and forest belts that break up the open ground.
 */
const ashfallCrossing: MapDef = {
  id: 'ashfall_crossing',
  name: 'Ashfall Crossing',
  description: '1v1 · river valley with a central bridge and two fords',
  width: SIZE,
  height: SIZE,
  maxPlayers: 2,
  seed: 7341,
  waterLevel: -1,
  spawns: [
    { x: 52, y: 52, facing: QUARTER },
    { x: SIZE - 52, y: SIZE - 52, facing: QUARTER + Math.PI },
  ],
  supplyFields: [
    { x: 84, y: 26, amount: 6000 },
    { x: 26, y: 84, amount: 6000 },
    { x: 62, y: 178, amount: 9000 },
    { x: 178, y: 62, amount: 9000 },
  ].flatMap((field) => [field, mirror(field)]),
  plateaus: [
    { x: 52, y: 52, radius: 44, height: 6, ramps: [QUARTER, QUARTER + 1.15, QUARTER - 1.15] },
    { x: SIZE - 52, y: SIZE - 52, radius: 44, height: 6, ramps: [QUARTER + Math.PI, QUARTER + Math.PI + 1.15, QUARTER + Math.PI - 1.15] },
  ],
  hills: [
    { x: 118, y: 118, radius: 26, height: 7 },
    { x: 34, y: 262, radius: 34, height: 11 },
    { x: 150, y: 28, radius: 20, height: 5 },
  ].flatMap((hill) => [hill, mirror(hill)]),
  river: {
    points: [
      { x: -10, y: 330 },
      { x: 80, y: 246 },
      { x: 160, y: 160 },
      { x: 240, y: 74 },
      { x: 330, y: -10 },
    ],
    width: 16,
    depth: 3.5,
    crossings: [
      { x: 160, y: 160, radius: 7, bridge: true },
      { x: 92, y: 233, radius: 10, bridge: false },
      { x: 228, y: 87, radius: 10, bridge: false },
    ],
  },
  roads: [
    [
      { x: 70, y: 70 },
      { x: 120, y: 128 },
      { x: 160, y: 160 },
      { x: 200, y: 192 },
      { x: 250, y: 250 },
    ],
    [
      { x: 40, y: 94 },
      { x: 58, y: 170 },
      { x: 92, y: 233 },
      { x: 150, y: 262 },
      { x: 226, y: 280 },
    ],
    [
      { x: 280, y: 226 },
      { x: 262, y: 150 },
      { x: 228, y: 87 },
      { x: 170, y: 58 },
      { x: 94, y: 40 },
    ],
  ],
  forests: [
    { x: 128, y: 34, radius: 16, density: 0.6 },
    { x: 20, y: 140, radius: 16, density: 0.6 },
    { x: 110, y: 200, radius: 14, density: 0.5 },
    { x: 200, y: 108, radius: 12, density: 0.5 },
  ].flatMap((forest) => [forest, mirror(forest)]),
};

export const MAPS: readonly MapDef[] = [ashfallCrossing];

export function getMap(id: string): MapDef {
  const map = MAPS.find((m) => m.id === id);
  if (!map) {
    throw new Error(`Unknown map '${id}'.`);
  }
  return map;
}
