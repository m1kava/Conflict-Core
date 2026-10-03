import { NAV_CELL_SIZE } from '../constants';
import type { BuildingDef } from '../data/types';

export interface Footprint {
  /** Snapped centre. */
  x: number;
  y: number;
  /** Extent along x / y in metres (after rotation). */
  width: number;
  depth: number;
  /** First navigation cell (bottom-left) and size in cells. */
  cellX: number;
  cellY: number;
  cellsWide: number;
  cellsDeep: number;
}

/**
 * Snaps a structure so its footprint aligns with navigation cells. Shared by the server (authoritative
 * placement) and the client (placement preview), so both agree on exactly which cells a structure covers.
 */
export function snapFootprint(def: BuildingDef, x: number, y: number, rotated: boolean): Footprint {
  const width = rotated ? def.depth : def.width;
  const depth = rotated ? def.width : def.depth;
  const left = Math.round((x - width / 2) / NAV_CELL_SIZE);
  const bottom = Math.round((y - depth / 2) / NAV_CELL_SIZE);
  return {
    x: left * NAV_CELL_SIZE + width / 2,
    y: bottom * NAV_CELL_SIZE + depth / 2,
    width,
    depth,
    cellX: left,
    cellY: bottom,
    cellsWide: width / NAV_CELL_SIZE,
    cellsDeep: depth / NAV_CELL_SIZE,
  };
}

/** Maximum terrain slope a structure can be placed on. */
export const MAX_BUILD_SLOPE = 0.45;
/** Clearance kept free around supply fields so trucks can always reach them. */
export const SUPPLY_FIELD_CLEARANCE = 9;
