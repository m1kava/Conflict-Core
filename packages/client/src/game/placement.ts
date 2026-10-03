import { MAX_BUILD_SLOPE, NAV_CELL_SIZE, SUPPLY_FIELD_CLEARANCE, snapFootprint, type BuildingDef } from '@conflict/shared';
import { isComplete, type ClientWorld } from './clientWorld';

/**
 * Client-side placement preview using the same footprint snapping and rules as the server. It can only use
 * what the client knows (own structures, seen enemy structures, visible units), so the server's answer is
 * final — this exists to give instant green/red feedback.
 */
export function canPlace(world: ClientWorld, def: BuildingDef, x: number, y: number, rotated: boolean): boolean {
  const footprint = snapFootprint(def, x, y, rotated);
  const terrain = world.terrain;
  for (let cy = footprint.cellY; cy < footprint.cellY + footprint.cellsDeep; cy++) {
    for (let cx = footprint.cellX; cx < footprint.cellX + footprint.cellsWide; cx++) {
      if (terrain.isTerrainBlocked(cx, cy)) {
        return false;
      }
      if (terrain.slopeAt((cx + 0.5) * NAV_CELL_SIZE, (cy + 0.5) * NAV_CELL_SIZE) > MAX_BUILD_SLOPE) {
        return false;
      }
    }
  }
  const faction = world.data.factions.get(def.faction);
  if (!faction) {
    return false;
  }
  const halfW = footprint.width / 2;
  const halfD = footprint.depth / 2;
  let inRadius = false;
  for (const entity of world.entities.values()) {
    if (entity.kind === 'resource') {
      if (Math.hypot(entity.x - footprint.x, entity.y - footprint.y) < SUPPLY_FIELD_CLEARANCE + Math.max(halfW, halfD)) {
        return false;
      }
      continue;
    }
    if (entity.kind === 'building' && entity.buildingDef) {
      const rotatedOther = Math.abs(Math.sin(entity.heading)) > 0.5;
      const ow = (rotatedOther ? entity.buildingDef.depth : entity.buildingDef.width) / 2;
      const od = (rotatedOther ? entity.buildingDef.width : entity.buildingDef.depth) / 2;
      if (Math.abs(entity.x - footprint.x) < ow + halfW && Math.abs(entity.y - footprint.y) < od + halfD) {
        return false;
      }
      if (entity.owner === world.slot && !entity.ghost) {
        const radius = Math.max(entity.buildingDef.width, entity.buildingDef.depth) / 2;
        if (Math.hypot(entity.x - footprint.x, entity.y - footprint.y) <= faction.buildRadius + radius) {
          inRadius = true;
        }
      }
    } else if (entity.kind === 'unit' && world.isEnemy(entity.owner)) {
      if (Math.abs(entity.x - footprint.x) < halfW + 1 && Math.abs(entity.y - footprint.y) < halfD + 1) {
        return false;
      }
    }
  }
  return inRadius && hasPrerequisites(world, def.prerequisites);
}

export function hasPrerequisites(world: ClientWorld, prerequisites: readonly string[]): boolean {
  return prerequisites.every((required) =>
    [...world.entities.values()].some((e) => e.owner === world.slot && !e.ghost && e.defId === required && isComplete(e)),
  );
}
