import type { Point } from '../math/geometry';

export interface SpawnDef extends Point {
  /** Direction the base faces (radians, 0 = +x), used to orient the HQ and initial camera. */
  facing: number;
}

export interface SupplyFieldDef extends Point {
  amount: number;
}

export interface PlateauDef extends Point {
  radius: number;
  height: number;
  /** Directions (radians) of ramps that lead off the plateau; elsewhere the edge is a cliff. */
  ramps: number[];
}

export interface HillDef extends Point {
  radius: number;
  height: number;
}

export interface CrossingDef extends Point {
  radius: number;
  bridge: boolean;
}

export interface RiverDef {
  points: Point[];
  width: number;
  depth: number;
  crossings: CrossingDef[];
}

export interface ForestDef extends Point {
  radius: number;
  density: number;
}

/** Data-driven map metadata. Terrain heights and passability are derived from these features. */
export interface MapDef {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  maxPlayers: number;
  seed: number;
  waterLevel: number;
  spawns: SpawnDef[];
  supplyFields: SupplyFieldDef[];
  plateaus: PlateauDef[];
  hills: HillDef[];
  river?: RiverDef;
  roads: Point[][];
  forests: ForestDef[];
}
