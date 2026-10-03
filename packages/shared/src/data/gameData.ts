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

/** Immutable, validated registry of all game definitions. */
export class GameData {
  readonly units = new Map<string, UnitDef>();
  readonly buildings = new Map<string, BuildingDef>();
  readonly weapons = new Map<string, WeaponDef>();
  readonly factions = new Map<string, FactionDef>();
  readonly veterancy: readonly VeterancyLevelDef[];
  readonly contentHash: string;
  private readonly armor = new Map<string, number>();

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
