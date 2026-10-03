/**
 * Authored game data shapes (JSON in packages/shared/data). Units: metres, seconds, degrees, credits.
 * Nothing balance-related is hard-coded in simulation code; everything below is data.
 */

export type UnitClass =
  | 'Infantry'
  | 'LightVehicle'
  | 'HeavyVehicle'
  | 'MainBattleTank'
  | 'TankDestroyer'
  | 'AntiAir'
  | 'Artillery'
  | 'RocketArtillery'
  | 'SupportVehicle'
  | 'Transport'
  | 'Helicopter'
  | 'JetAircraft'
  | 'Bomber'
  | 'Drone'
  | 'Builder'
  | 'Harvester'
  | 'Special';

export type Locomotor = 'Foot' | 'Wheeled' | 'Tracked' | 'Hover' | 'Helicopter' | 'Jet';

export type WeaponDelivery = 'Hitscan' | 'Projectile' | 'Missile' | 'Ballistic';

export type TargetLayer = 'Ground' | 'Air' | 'Structure';

export interface ArmorModifierDef {
  damageType: string;
  armorType: string;
  multiplier: number;
}

export interface VeterancyLevelDef {
  id: string;
  displayName: string;
  /** Multiple of the unit's own cost in experience. */
  experienceRequired: number;
  damageMultiplier?: number;
  reloadMultiplier?: number;
  accuracyMultiplier?: number;
  healthMultiplier?: number;
  speedMultiplier?: number;
  regenerationPerSecond?: number;
}

export interface CombatDataFile {
  damageTypes: string[];
  armorTypes: string[];
  armorModifiers: ArmorModifierDef[];
  veterancyLevels: VeterancyLevelDef[];
}

export interface WeaponPresentation {
  muzzle: 'rifle' | 'autocannon' | 'cannon' | 'missile' | 'howitzer' | 'sam';
  projectile: 'none' | 'tracer' | 'shell' | 'missile' | 'arc';
  impact: 'bullet' | 'small' | 'medium' | 'large' | 'air';
}

export interface WeaponDef {
  id: string;
  delivery: WeaponDelivery;
  damage: number;
  damageType: string;
  range: number;
  minRange?: number;
  reloadTime: number;
  burstCount?: number;
  burstInterval?: number;
  accuracy: number;
  splashRadius?: number;
  splashEdgeFactor?: number;
  projectileSpeed?: number;
  friendlyFire?: boolean;
  targets: TargetLayer[];
  presentation: WeaponPresentation;
}

export interface WeaponMountDef {
  weapon: string;
  turreted: boolean;
  /** Degrees per second; turreted mounts only. */
  turretTurnRate?: number;
}

export interface MovementDef {
  locomotor: Locomotor;
  speed: number;
  acceleration: number;
  /** Hull turn rate in degrees per second. */
  turnRate: number;
  radius: number;
}

export interface UnitDef {
  id: string;
  faction: string;
  class: UnitClass;
  displayName: string;
  description: string;
  health: number;
  armorType: string;
  movement: MovementDef;
  weapons: WeaponMountDef[];
  visionRadius: number;
  detectionRadius?: number;
  cost: number;
  buildTime: number;
  prerequisites: string[];
  experienceValue: number;
  /** Builder: can construct structures. Harvester: hauls supplies. */
  canConstruct?: boolean;
  harvestCapacity?: number;
  harvestTime?: number;
  /** Visual model key understood by the client model library. */
  model: string;
  hotkey?: string;
}

export interface BuildingDef {
  id: string;
  faction: string;
  displayName: string;
  description: string;
  health: number;
  armorType: string;
  /** Footprint in metres (multiples of the navigation cell size). */
  width: number;
  depth: number;
  /** Positive generates power, negative consumes. */
  power: number;
  cost: number;
  buildTime: number;
  prerequisites: string[];
  visionRadius: number;
  produces: string[];
  /** Losing all critical structures (and builders) defeats a player. */
  critical: boolean;
  /** Supply trucks deliver credits here. */
  supplyDropOff?: boolean;
  /** Unit spawned for free when construction completes (e.g. first supply truck). */
  freeUnit?: string;
  /** Reveals the minimap while powered. */
  providesRadar?: boolean;
  weapons?: WeaponMountDef[];
  /** Not offered in build menus (e.g. starting HQ). */
  buildable: boolean;
  model: string;
}

export interface FactionDef {
  id: string;
  displayName: string;
  playable: boolean;
  startingBuilding: string;
  startingUnits: string[];
  startingCredits: number;
  /** Builders can only place structures within this distance of an existing own structure. */
  buildRadius: number;
}

export interface FactionDataFile {
  factions: FactionDef[];
  units: UnitDef[];
  buildings: BuildingDef[];
  weapons: WeaponDef[];
}
