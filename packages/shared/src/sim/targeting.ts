import type { TargetLayer, WeaponDef } from '../data/types';
import type { Entity } from './entity';
import type { World } from './world';

export function targetLayer(entity: Entity): TargetLayer {
  return entity.kind === 'building' ? 'Structure' : 'Ground';
}

/** Whether a weapon can usefully engage a target (layer allowed and damage multiplier above zero). */
export function weaponCanAttack(world: World, weapon: WeaponDef, target: Entity): boolean {
  return target.kind !== 'resource' && weapon.targets.includes(targetLayer(target)) && world.data.canDamage(weapon, target.armorType);
}

export function canAttack(world: World, attacker: Entity, target: Entity): boolean {
  return attacker.weapons.some((w) => weaponCanAttack(world, w.def, target));
}

/** Longest range among weapons able to attack the target (0 if none). */
export function attackRange(world: World, attacker: Entity, target: Entity): number {
  let range = 0;
  for (const weapon of attacker.weapons) {
    if (weaponCanAttack(world, weapon.def, target)) {
      range = Math.max(range, weapon.def.range);
    }
  }
  return range;
}

export function maxWeaponRange(entity: Entity): number {
  let range = 0;
  for (const weapon of entity.weapons) {
    range = Math.max(range, weapon.def.range);
  }
  return range;
}

/** Centre distance minus target radius: what weapon ranges are measured against. */
export function edgeDistance(a: Entity, b: Entity): number {
  return Math.max(0, Math.hypot(b.x - a.x, b.y - a.y) - b.radius);
}

export function isValidTarget(world: World, attacker: Entity, target: Entity | undefined): target is Entity {
  return (
    target !== undefined &&
    target.alive &&
    target.owner >= 0 &&
    target.team !== attacker.team &&
    world.isVisibleToTeam(attacker.team, target) &&
    canAttack(world, attacker, target)
  );
}

/**
 * Picks the best enemy within `radius`: armed units first, then other units, then structures; nearest wins
 * within a category. Iteration order is deterministic (spatial buckets filled in entity order).
 */
export function findTarget(world: World, attacker: Entity, radius: number): Entity | undefined {
  let best: Entity | undefined;
  let bestScore = Infinity;
  world.spatial.query(attacker.x, attacker.y, radius, (candidate) => {
    if (candidate.owner < 0 || candidate.team === attacker.team || !world.isVisibleToTeam(attacker.team, candidate)) {
      return;
    }
    if (!canAttack(world, attacker, candidate)) {
      return;
    }
    const d = edgeDistance(attacker, candidate);
    if (d > radius) {
      return;
    }
    let score = d;
    if (candidate.kind === 'building') {
      score += candidate.weapons.length > 0 ? 10 : 40;
    } else if (candidate.weapons.length === 0) {
      score += 15;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}
