import type { BuildingDef, UnitDef, WeaponDef, WeaponMountDef } from '../data/types';

export type EntityKind = 'unit' | 'building' | 'resource';

export type OrderType = 'idle' | 'move' | 'attackMove' | 'attack' | 'hold' | 'guard' | 'construct' | 'harvest' | 'repair';

export interface Order {
  type: OrderType;
  x: number;
  y: number;
  /** Target entity (attack, repair, harvest field, construction site). 0 = none. */
  targetId: number;
  /** Structure to place (construct orders before the site exists). */
  buildingDefId?: string;
  rotated?: boolean;
}

export interface WeaponState {
  def: WeaponDef;
  mount: WeaponMountDef;
  /** Ticks until the next burst may start. */
  cooldown: number;
  burstRemaining: number;
  burstTimer: number;
  /** Absolute turret yaw (radians); equals hull heading for fixed mounts. */
  turretYaw: number;
}

export interface ProductionItem {
  unitId: string;
  progress: number;
  totalTicks: number;
  cost: number;
}

export type HarvestPhase = 'toField' | 'loading' | 'toDepot';

/**
 * One simulated object. A single flat shape (rather than class hierarchies) keeps systems simple and the
 * snapshot encoder straightforward; kind-specific fields are only meaningful for that kind.
 */
export interface Entity {
  id: number;
  kind: EntityKind;
  defId: string;
  owner: number;
  team: number;
  x: number;
  y: number;
  heading: number;
  hp: number;
  maxHp: number;
  radius: number;
  armorType: string;
  visionRadius: number;
  cost: number;
  alive: boolean;
  weapons: WeaponState[];
  targetId: number;
  /** Tick on which the entity last took damage (for "under attack" alerts and UI). */
  lastDamagedTick: number;

  // Units
  unitDef?: UnitDef;
  order: Order;
  orderQueue: Order[];
  path: number[];
  pathIndex: number;
  pathPending: boolean;
  pathGoalX: number;
  pathGoalY: number;
  speed: number;
  moving: boolean;
  stuckTicks: number;
  lastProgressDistance: number;
  xp: number;
  veterancy: number;
  guardX: number;
  guardY: number;
  cargo: number;
  harvestPhase: HarvestPhase;
  harvestTimer: number;

  // Buildings
  buildingDef?: BuildingDef;
  rotated: boolean;
  complete: boolean;
  constructionProgress: number;
  queue: ProductionItem[];
  rallyX: number;
  rallyY: number;
  hasRally: boolean;
  /** Navigation cells occupied (flat list of cell indices). */
  cells: number[];

  // Resources
  supply: number;
}

export function createEntity(id: number, kind: EntityKind, defId: string, owner: number, team: number, x: number, y: number): Entity {
  return {
    id,
    kind,
    defId,
    owner,
    team,
    x,
    y,
    heading: 0,
    hp: 1,
    maxHp: 1,
    radius: 1,
    armorType: 'structure',
    visionRadius: 0,
    cost: 0,
    alive: true,
    weapons: [],
    targetId: 0,
    lastDamagedTick: -1000,
    order: { type: 'idle', x, y, targetId: 0 },
    orderQueue: [],
    path: [],
    pathIndex: 0,
    pathPending: false,
    pathGoalX: x,
    pathGoalY: y,
    speed: 0,
    moving: false,
    stuckTicks: 0,
    lastProgressDistance: Infinity,
    xp: 0,
    veterancy: 0,
    guardX: x,
    guardY: y,
    cargo: 0,
    harvestPhase: 'toField',
    harvestTimer: 0,
    rotated: false,
    complete: true,
    constructionProgress: 1,
    queue: [],
    rallyX: x,
    rallyY: y,
    hasRally: false,
    cells: [],
    supply: 0,
  };
}

export function isUnit(entity: Entity): boolean {
  return entity.kind === 'unit';
}

export function isBuilding(entity: Entity): boolean {
  return entity.kind === 'building';
}
