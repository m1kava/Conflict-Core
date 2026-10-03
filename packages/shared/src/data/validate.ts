import type { BuildingDef, CombatDataFile, FactionDataFile, UnitDef, WeaponDef, WeaponMountDef } from './types';

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_MAGNITUDE = 1_000_000;

/**
 * Cross-file consistency checks: unique ids, resolvable references, sane ranges and a complete
 * damage × armor matrix. Runs in CI (npm run validate-data), in tests and at server start-up.
 */
export function validateGameData(combat: CombatDataFile, factionFiles: FactionDataFile[]): string[] {
  const issues: string[] = [];
  const damageTypes = new Set(combat.damageTypes);
  const armorTypes = new Set(combat.armorTypes);

  validateArmorMatrix(combat, issues);
  validateVeterancy(combat, issues);

  const weapons = collectIds(factionFiles.flatMap((f) => f.weapons), 'weapon', issues);
  const units = collectIds(factionFiles.flatMap((f) => f.units), 'unit', issues);
  const buildings = collectIds(factionFiles.flatMap((f) => f.buildings), 'building', issues);
  const factions = collectIds(factionFiles.flatMap((f) => f.factions), 'faction', issues);

  for (const id of units.keys()) {
    if (buildings.has(id)) {
      issues.push(`Id '${id}' is used by both a unit and a building.`);
    }
  }

  for (const weapon of weapons.values()) {
    validateWeapon(weapon, damageTypes, issues);
  }

  const requirable = new Set([...buildings.keys()]);
  for (const unit of units.values()) {
    validateUnit(unit, { factions, armorTypes, weapons, requirable }, issues);
  }
  for (const building of buildings.values()) {
    validateBuilding(building, { factions, armorTypes, weapons, requirable, units }, issues);
  }
  for (const faction of factions.values()) {
    const at = `faction ${faction.id}`;
    if (!buildings.has(faction.startingBuilding)) {
      issues.push(`${at}: unknown starting building '${faction.startingBuilding}'.`);
    }
    for (const unit of faction.startingUnits) {
      if (!units.has(unit)) {
        issues.push(`${at}: unknown starting unit '${unit}'.`);
      }
    }
    positive(faction.buildRadius, 'buildRadius', at, issues);
    range(faction.startingCredits, 0, MAX_MAGNITUDE, 'startingCredits', at, issues);
  }
  return issues;
}

function collectIds<T extends { id: string }>(items: T[], kind: string, issues: string[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!ID_PATTERN.test(item.id)) {
      issues.push(`${kind} id '${item.id}' must be lower_snake_case.`);
    } else if (map.has(item.id)) {
      issues.push(`Duplicate ${kind} id '${item.id}'.`);
    } else {
      map.set(item.id, item);
    }
  }
  return map;
}

function validateArmorMatrix(combat: CombatDataFile, issues: string[]): void {
  const seen = new Set<string>();
  for (const modifier of combat.armorModifiers) {
    const key = `${modifier.damageType}|${modifier.armorType}`;
    if (!combat.damageTypes.includes(modifier.damageType)) {
      issues.push(`Armor modifier references unknown damage type '${modifier.damageType}'.`);
    }
    if (!combat.armorTypes.includes(modifier.armorType)) {
      issues.push(`Armor modifier references unknown armor type '${modifier.armorType}'.`);
    }
    if (seen.has(key)) {
      issues.push(`Duplicate armor modifier ${key}.`);
    }
    seen.add(key);
    range(modifier.multiplier, 0, 10, 'multiplier', key, issues);
  }
  for (const damage of combat.damageTypes) {
    for (const armor of combat.armorTypes) {
      if (!seen.has(`${damage}|${armor}`)) {
        issues.push(`Missing armor modifier ${damage} vs ${armor}.`);
      }
    }
  }
}

function validateVeterancy(combat: CombatDataFile, issues: string[]): void {
  const levels = combat.veterancyLevels;
  if (levels.length === 0 || levels[0]?.experienceRequired !== 0) {
    issues.push('The first veterancy level must require 0 experience.');
  }
  for (let i = 1; i < levels.length; i++) {
    const level = levels[i];
    const previous = levels[i - 1];
    if (level && previous && level.experienceRequired <= previous.experienceRequired) {
      issues.push(`Veterancy level '${level.id}' must require more experience than '${previous.id}'.`);
    }
  }
}

function validateWeapon(weapon: WeaponDef, damageTypes: Set<string>, issues: string[]): void {
  const at = `weapon ${weapon.id}`;
  if (!damageTypes.has(weapon.damageType)) {
    issues.push(`${at}: unknown damage type '${weapon.damageType}'.`);
  }
  positive(weapon.damage, 'damage', at, issues);
  positive(weapon.range, 'range', at, issues);
  range(weapon.minRange ?? 0, 0, weapon.range, 'minRange', at, issues);
  positive(weapon.reloadTime, 'reloadTime', at, issues);
  range(weapon.accuracy, 0, 1, 'accuracy', at, issues);
  range(weapon.splashEdgeFactor ?? 1, 0, 1, 'splashEdgeFactor', at, issues);
  if ((weapon.burstCount ?? 1) < 1 || !Number.isInteger(weapon.burstCount ?? 1)) {
    issues.push(`${at}: burstCount must be a positive integer.`);
  }
  if ((weapon.burstCount ?? 1) > 1) {
    positive(weapon.burstInterval ?? 0, 'burstInterval', at, issues);
  }
  if (weapon.delivery !== 'Hitscan') {
    positive(weapon.projectileSpeed ?? 0, 'projectileSpeed', at, issues);
  }
  if (weapon.targets.length === 0) {
    issues.push(`${at}: must list at least one target layer.`);
  }
}

interface ReferenceSets {
  factions: Map<string, unknown>;
  armorTypes: Set<string>;
  weapons: Map<string, WeaponDef>;
  requirable: Set<string>;
}

function validateMounts(mounts: WeaponMountDef[], weapons: Map<string, WeaponDef>, at: string, issues: string[]): void {
  mounts.forEach((mount, index) => {
    if (!weapons.has(mount.weapon)) {
      issues.push(`${at}.weapons[${index}]: unknown weapon '${mount.weapon}'.`);
    }
    if (mount.turreted) {
      positive(mount.turretTurnRate ?? 0, 'turretTurnRate', `${at}.weapons[${index}]`, issues);
    }
  });
}

function validateUnit(unit: UnitDef, refs: ReferenceSets, issues: string[]): void {
  const at = `unit ${unit.id}`;
  if (!refs.factions.has(unit.faction)) {
    issues.push(`${at}: unknown faction '${unit.faction}'.`);
  }
  if (!refs.armorTypes.has(unit.armorType)) {
    issues.push(`${at}: unknown armor type '${unit.armorType}'.`);
  }
  positive(unit.health, 'health', at, issues);
  positive(unit.visionRadius, 'visionRadius', at, issues);
  positive(unit.buildTime, 'buildTime', at, issues);
  range(unit.cost, 0, MAX_MAGNITUDE, 'cost', at, issues);
  positive(unit.movement.speed, 'movement.speed', at, issues);
  positive(unit.movement.acceleration, 'movement.acceleration', at, issues);
  positive(unit.movement.turnRate, 'movement.turnRate', at, issues);
  positive(unit.movement.radius, 'movement.radius', at, issues);
  validateMounts(unit.weapons, refs.weapons, at, issues);
  for (const requirement of unit.prerequisites) {
    if (!refs.requirable.has(requirement)) {
      issues.push(`${at}: unknown prerequisite '${requirement}'.`);
    }
  }
  if (unit.class === 'Harvester') {
    positive(unit.harvestCapacity ?? 0, 'harvestCapacity', at, issues);
    positive(unit.harvestTime ?? 0, 'harvestTime', at, issues);
  }
  if (!unit.displayName) {
    issues.push(`${at}: displayName is required.`);
  }
}

function validateBuilding(
  building: BuildingDef,
  refs: ReferenceSets & { units: Map<string, UnitDef> },
  issues: string[],
): void {
  const at = `building ${building.id}`;
  if (!refs.factions.has(building.faction)) {
    issues.push(`${at}: unknown faction '${building.faction}'.`);
  }
  if (!refs.armorTypes.has(building.armorType)) {
    issues.push(`${at}: unknown armor type '${building.armorType}'.`);
  }
  positive(building.health, 'health', at, issues);
  positive(building.buildTime, 'buildTime', at, issues);
  positive(building.visionRadius, 'visionRadius', at, issues);
  for (const dimension of [building.width, building.depth]) {
    if (dimension <= 0 || dimension % 2 !== 0) {
      issues.push(`${at}: footprint must be positive multiples of 2 m.`);
    }
  }
  for (const produced of building.produces) {
    if (!refs.units.has(produced)) {
      issues.push(`${at}: produces unknown unit '${produced}'.`);
    }
  }
  if (building.freeUnit && !refs.units.has(building.freeUnit)) {
    issues.push(`${at}: unknown free unit '${building.freeUnit}'.`);
  }
  for (const requirement of building.prerequisites) {
    if (!refs.requirable.has(requirement)) {
      issues.push(`${at}: unknown prerequisite '${requirement}'.`);
    }
  }
  validateMounts(building.weapons ?? [], refs.weapons, at, issues);
}

function positive(value: number, field: string, at: string, issues: string[]): void {
  if (!(value > 0 && value <= MAX_MAGNITUDE)) {
    issues.push(`${at}: ${field} must be in (0, ${MAX_MAGNITUDE}] but is ${value}.`);
  }
}

function range(value: number, min: number, max: number, field: string, at: string, issues: string[]): void {
  if (!(value >= min && value <= max)) {
    issues.push(`${at}: ${field} must be in [${min}, ${max}] but is ${value}.`);
  }
}
