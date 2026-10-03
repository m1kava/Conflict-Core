import { TICK_SECONDS } from '../constants';
import type { WeaponDef } from '../data/types';
import { rotateTowards, wrapAngle } from '../math/geometry';
import type { Entity, WeaponState } from './entity';
import { edgeDistance, findTarget, isValidTarget, maxWeaponRange, weaponCanAttack } from './targeting';
import type { World } from './world';

export interface Projectile {
  weapon: WeaponDef;
  shooterId: number;
  owner: number;
  team: number;
  targetId: number;
  tx: number;
  ty: number;
  impactTick: number;
  hit: boolean;
  damageMultiplier: number;
}

const DEG_TO_RAD = Math.PI / 180;
const AIM_TOLERANCE = 0.12;
const MISS_SCATTER = 3.5;
const BALLISTIC_SCATTER_PER_INACCURACY = 10;
const SHELL_TRACKING_TOLERANCE = 3;
const TOWER_SCAN_INTERVAL = 5;

/** Turret aiming, burst timing and shot resolution for every armed entity. */
export function updateCombat(world: World): void {
  for (const entity of world.entities.values()) {
    if (!entity.alive || entity.weapons.length === 0) {
      continue;
    }
    if (entity.kind === 'building') {
      if (!entity.complete || world.player(entity.owner)?.lowPower) {
        continue;
      }
      acquireForStructure(world, entity);
    }
    const target = world.entities.get(entity.targetId);
    const validTarget = isValidTarget(world, entity, target) ? target : undefined;
    for (const weapon of entity.weapons) {
      updateWeapon(world, entity, weapon, validTarget);
    }
  }
}

function acquireForStructure(world: World, building: Entity): void {
  const range = maxWeaponRange(building);
  const current = world.entities.get(building.targetId);
  if (isValidTarget(world, building, current) && edgeDistance(building, current) <= range) {
    return;
  }
  building.targetId = 0;
  if ((world.tick + building.id) % TOWER_SCAN_INTERVAL === 0) {
    building.targetId = findTarget(world, building, range)?.id ?? 0;
  }
}

function updateWeapon(world: World, shooter: Entity, weapon: WeaponState, target: Entity | undefined): void {
  if (weapon.cooldown > 0) {
    weapon.cooldown--;
  }
  const turnRate = (weapon.mount.turretTurnRate ?? 0) * DEG_TO_RAD * TICK_SECONDS;

  if (!target || !weaponCanAttack(world, weapon.def, target)) {
    weapon.burstRemaining = 0;
    weapon.turretYaw = weapon.mount.turreted ? rotateTowards(weapon.turretYaw, shooter.heading, turnRate) : shooter.heading;
    return;
  }

  const desiredYaw = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  if (weapon.mount.turreted) {
    weapon.turretYaw = rotateTowards(weapon.turretYaw, desiredYaw, turnRate);
  } else {
    weapon.turretYaw = shooter.kind === 'unit' && shooter.unitDef?.movement.locomotor === 'Foot' ? desiredYaw : shooter.heading;
  }

  const distance = edgeDistance(shooter, target);
  const inRange = distance <= weapon.def.range && distance >= (weapon.def.minRange ?? 0);
  const aligned = Math.abs(wrapAngle(desiredYaw - weapon.turretYaw)) <= AIM_TOLERANCE;
  const infantryMoving = shooter.kind === 'unit' && shooter.moving && !weapon.mount.turreted;
  if (!inRange || !aligned || infantryMoving) {
    return;
  }

  if (weapon.burstRemaining > 0) {
    weapon.burstTimer--;
    if (weapon.burstTimer <= 0) {
      // Follow-up shots of a hitscan burst are not announced: the first shot's event tells clients to play the
      // whole burst (count and interval come from weapon data), which keeps event traffic small.
      fire(world, shooter, weapon, target, weapon.def.delivery !== 'Hitscan');
      weapon.burstRemaining--;
      weapon.burstTimer = world.ticks(weapon.def.burstInterval ?? 0.1);
    }
    return;
  }
  if (weapon.cooldown === 0) {
    fire(world, shooter, weapon, target);
    weapon.burstRemaining = (weapon.def.burstCount ?? 1) - 1;
    weapon.burstTimer = world.ticks(weapon.def.burstInterval ?? 0.1);
    const reload = weapon.def.reloadTime * (world.veterancyLevel(shooter).reloadMultiplier ?? 1);
    weapon.cooldown = world.ticks(reload);
  }
}

function fire(world: World, shooter: Entity, weapon: WeaponState, target: Entity, announce = true): void {
  const def = weapon.def;
  const veterancy = shooter.kind === 'unit' ? world.veterancyLevel(shooter) : undefined;
  const accuracy = Math.min(1, def.accuracy * (veterancy?.accuracyMultiplier ?? 1) * (target.moving ? 0.85 : 1));
  const hit = world.rng.chance(accuracy);
  const damageMultiplier = veterancy?.damageMultiplier ?? 1;
  const muzzle = shooter.radius * 0.8;
  const mx = shooter.x + Math.cos(weapon.turretYaw) * muzzle;
  const my = shooter.y + Math.sin(weapon.turretYaw) * muzzle;

  let tx = target.x;
  let ty = target.y;
  if (def.delivery === 'Ballistic') {
    const scatter = (1 - accuracy) * BALLISTIC_SCATTER_PER_INACCURACY;
    tx += world.rng.range(-scatter, scatter);
    ty += world.rng.range(-scatter, scatter);
  } else if (!hit) {
    tx += world.rng.range(-MISS_SCATTER, MISS_SCATTER);
    ty += world.rng.range(-MISS_SCATTER, MISS_SCATTER);
  }

  if (def.delivery === 'Hitscan') {
    if (announce) {
      world.events.push({ type: 'fire', shooter: shooter.id, weapon: def.id, x: mx, y: my, tx, ty, target: target.id, flight: 0, hit });
    }
    if (hit) {
      applyHit(world, def, shooter, target, damageMultiplier);
    }
    return;
  }

  const travel = Math.hypot(tx - mx, ty - my);
  const flight = Math.max(1, Math.round(travel / (def.projectileSpeed ?? 100) / TICK_SECONDS));
  world.events.push({ type: 'fire', shooter: shooter.id, weapon: def.id, x: mx, y: my, tx, ty, target: target.id, flight, hit });
  world.projectiles.push({
    weapon: def,
    shooterId: shooter.id,
    owner: shooter.owner,
    team: shooter.team,
    targetId: target.id,
    tx,
    ty,
    impactTick: world.tick + flight,
    hit,
    damageMultiplier,
  });
}

/** Resolves projectiles whose flight time has elapsed. */
export function updateProjectiles(world: World): void {
  let write = 0;
  for (const projectile of world.projectiles) {
    if (projectile.impactTick > world.tick) {
      world.projectiles[write++] = projectile;
      continue;
    }
    resolveImpact(world, projectile);
  }
  world.projectiles.length = write;
}

function resolveImpact(world: World, projectile: Projectile): void {
  const def = projectile.weapon;
  const shooter = world.entities.get(projectile.shooterId) ?? null;
  const target = world.entities.get(projectile.targetId);
  let x = projectile.tx;
  let y = projectile.ty;

  if (def.delivery === 'Missile' && projectile.hit && target?.alive) {
    // Guided: follows the target to impact.
    x = target.x;
    y = target.y;
    applyDirect(world, def, shooter, target, projectile.damageMultiplier);
  } else if (def.delivery === 'Projectile' && projectile.hit && target?.alive && Math.hypot(target.x - x, target.y - y) <= target.radius + SHELL_TRACKING_TOLERANCE) {
    x = target.x;
    y = target.y;
    applyDirect(world, def, shooter, target, projectile.damageMultiplier);
  }
  world.events.push({ type: 'impact', weapon: def.id, x, y });
  applySplash(world, def, shooter, x, y, projectile.damageMultiplier, projectile.team, def.delivery === 'Ballistic' ? 0 : projectile.targetId);
}

function applyHit(world: World, def: WeaponDef, shooter: Entity, target: Entity, multiplier: number): void {
  applyDirect(world, def, shooter, target, multiplier);
  applySplash(world, def, shooter, target.x, target.y, multiplier, shooter.team, target.id);
}

function applyDirect(world: World, def: WeaponDef, shooter: Entity | null, target: Entity, multiplier: number): void {
  const damage = def.damage * multiplier * world.data.armorModifier(def.damageType, target.armorType);
  world.damage(target, damage, shooter?.alive ? shooter : null);
}

/** Area damage with linear falloff to `splashEdgeFactor`; skips the direct-hit target and (optionally) friendlies. */
function applySplash(
  world: World,
  def: WeaponDef,
  shooter: Entity | null,
  x: number,
  y: number,
  multiplier: number,
  team: number,
  directTargetId: number,
): void {
  const radius = def.splashRadius ?? 0;
  if (radius <= 0) {
    return;
  }
  const edge = def.splashEdgeFactor ?? 1;
  const victims: Entity[] = [];
  world.spatial.query(x, y, radius, (entity) => {
    if (entity.id !== directTargetId && entity.owner >= 0 && (def.friendlyFire || entity.team !== team)) {
      victims.push(entity);
    }
  });
  for (const victim of victims) {
    const distance = Math.max(0, Math.hypot(victim.x - x, victim.y - y) - victim.radius);
    const falloff = 1 - (1 - edge) * Math.min(1, distance / radius);
    const damage = def.damage * multiplier * falloff * world.data.armorModifier(def.damageType, victim.armorType);
    world.damage(victim, damage, shooter?.alive ? shooter : null);
  }
}
