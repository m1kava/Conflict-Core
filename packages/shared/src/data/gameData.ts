import combatJson from '../../data/combat.json';
import halcyonJson from '../../data/halcyon.json';
import { TICK_RATE } from '../constants';
import type {
  BuildingDef,
  CombatDataFile,
  FactionDataFile,
  FactionDef,
  UnitDef,
  VeterancyLevelDef,
  WeaponDef,
} from './types';
import { validateGameData } from './validate';

/** Definition id of neutral supply fields. */
export const RESOURCE_DEF_ID = 'supply_field';

/** Immutable, validated registry of all game definitions. */
export class GameData {
  readonly units = new Map<string, UnitDef>();
  readonly buildings = new Map<string, BuildingDef>();
  readonly weapons = new Map<string, WeaponDef>();
  readonly factions = new Map<string, FactionDef>();
  readonly veterancy: readonly VeterancyLevelDef[];
  readonly contentHash: string;
  /** Stable network index of every entity definition (units, buildings, resource) — sorted by id. */
  readonly entityDefIds: readonly string[];
  /** Stable network index of every weapon — sorted by id. */
  readonly weaponIds: readonly string[];
  private readonly armor = new Map<string, number>();
  private readonly defIndices = new Map<string, number>();
  private readonly weaponIndices = new Map<string, number>();

  constructor(combat: CombatDataFile, factionFiles: FactionDataFile[]) {
    const issues = validateGameData(combat, factionFiles);
    if (issues.length > 0) {
      throw new Error(`Invalid game data:\n${issues.join('\n')}`);
    }
    for (const file of factionFiles) {
      file.units.forEach((u) => this.units.set(u.id, u));
      file.buildings.forEach((b) => this.buildings.set(b.id, b));
      file.weapons.forEach((w) => this.weapons.set(w.id, w));
      file.factions.forEach((f) => this.factions.set(f.id, f));
    }
    for (const modifier of combat.armorModifiers) {
      this.armor.set(`${modifier.damageType}|${modifier.armorType}`, modifier.multiplier);
    }
    this.veterancy = combat.veterancyLevels;
    this.entityDefIds = [...this.units.keys(), ...this.buildings.keys(), RESOURCE_DEF_ID].sort();
    this.entityDefIds.forEach((id, index) => this.defIndices.set(id, index));
    this.weaponIds = [...this.weapons.keys()].sort();
    this.weaponIds.forEach((id, index) => this.weaponIndices.set(id, index));
    this.contentHash = hashString(JSON.stringify([combat, factionFiles]));
  }

  unit(id: string): UnitDef {
    const def = this.units.get(id);
    if (!def) {
      throw new Error(`Unknown unit '${id}'.`);
    }
    return def;
  }

  building(id: string): BuildingDef {
    const def = this.buildings.get(id);
    if (!def) {
      throw new Error(`Unknown building '${id}'.`);
    }
    return def;
  }

  weapon(id: string): WeaponDef {
    const def = this.weapons.get(id);
    if (!def) {
      throw new Error(`Unknown weapon '${id}'.`);
    }
    return def;
  }

  defIndex(id: string): number {
    const index = this.defIndices.get(id);
    if (index === undefined) {
      throw new Error(`Unknown entity definition '${id}'.`);
    }
    return index;
  }

  weaponIndex(id: string): number {
    const index = this.weaponIndices.get(id);
    if (index === undefined) {
      throw new Error(`Unknown weapon '${id}'.`);
    }
    return index;
  }

  armorModifier(damageType: string, armorType: string): number {
    return this.armor.get(`${damageType}|${armorType}`) ?? 1;
  }

  /** Whether a weapon can usefully attack an armor type at all (multiplier above zero). */
  canDamage(weapon: WeaponDef, armorType: string): boolean {
    return this.armorModifier(weapon.damageType, armorType) > 0;
  }
}

/** Converts seconds to whole simulation ticks (at least one). */
export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE));
}

function hashString(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
}

let defaultData: GameData | undefined;

/** The authored game data bundled with this build (shared by client and server). */
export function getGameData(): GameData {
  defaultData ??= new GameData(combatJson as CombatDataFile, [halcyonJson as FactionDataFile]);
  return defaultData;
}
