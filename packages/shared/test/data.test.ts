import { describe, expect, it } from 'vitest';
import combat from '../data/combat.json';
import halcyon from '../data/halcyon.json';
import { getGameData, validateGameData, type CombatDataFile, type FactionDataFile } from '../src/index';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('game data', () => {
  it('authored data is valid', () => {
    expect(validateGameData(combat as CombatDataFile, [halcyon as FactionDataFile])).toEqual([]);
    expect(getGameData().units.size).toBeGreaterThanOrEqual(8);
    expect(getGameData().buildings.size).toBeGreaterThanOrEqual(7);
  });

  it('reports broken references', () => {
    const faction = clone(halcyon) as FactionDataFile;
    faction.units[0]!.weapons.push({ weapon: 'missing_gun', turreted: false });
    faction.buildings[0]!.produces.push('missing_unit');
    const issues = validateGameData(combat as CombatDataFile, [faction]);
    expect(issues.some((i) => i.includes("unknown weapon 'missing_gun'"))).toBe(true);
    expect(issues.some((i) => i.includes("produces unknown unit 'missing_unit'"))).toBe(true);
  });

  it('reports an incomplete armor matrix', () => {
    const c = clone(combat) as CombatDataFile;
    c.armorModifiers.pop();
    expect(validateGameData(c, [halcyon as FactionDataFile]).some((i) => i.startsWith('Missing armor modifier'))).toBe(true);
  });

  it('reports out-of-range values and bad ids', () => {
    const faction = clone(halcyon) as FactionDataFile;
    faction.units[0]!.health = 0;
    faction.weapons[0]!.accuracy = 1.5;
    faction.buildings[0]!.id = 'Bad-Id';
    const issues = validateGameData(combat as CombatDataFile, [faction]);
    expect(issues.some((i) => i.includes('health'))).toBe(true);
    expect(issues.some((i) => i.includes('accuracy'))).toBe(true);
    expect(issues.some((i) => i.includes('lower_snake_case'))).toBe(true);
  });

  it('armor matrix encodes counters', () => {
    const data = getGameData();
    expect(data.armorModifier('armor_piercing', 'heavy_vehicle')).toBeGreaterThan(data.armorModifier('small_arms', 'heavy_vehicle'));
    expect(data.armorModifier('small_arms', 'infantry')).toBeGreaterThan(data.armorModifier('armor_piercing', 'infantry'));
  });
});
