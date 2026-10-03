import type { Command } from './commands';
import type { Entity, Order } from './entity';
import { computeFormation } from './formation';
import { attackRange, edgeDistance, findTarget, isValidTarget, maxWeaponRange } from './targeting';
import type { World } from './world';

const MAX_QUEUE = 5;
const ACQUIRE_INTERVAL = 5;
const IDLE_CHASE_LEASH = 14;
const GUARD_CHASE_LEASH = 28;
const ATTACK_MOVE_SCAN_BONUS = 8;
const ARRIVAL_DISTANCE = 1.2;
const LOOSE_ARRIVAL_DISTANCE = 5;
const GIVE_UP_STUCK_TICKS = 60;
const REPATH_TARGET_DRIFT = 6;
const BUILD_REACH = 2.5;
const HARVEST_REACH = 5;
const DEPOT_REACH = 3;
const REPAIR_FRACTION_PER_SECOND = 0.03;

// ------------------------------------------------------------------ command application

/** Applies one player command after semantic validation against authoritative state. */
export function applyCommand(world: World, player: number, command: Command): void {
  switch (command.type) {
    case 'move':
    case 'attackMove': {
      const units = ownedUnits(world, player, command.units).filter((u) => u.unitDef!.movement.speed > 0);
      if (units.length === 0) {
        return;
      }
      const x = clampToMap(world, command.x, 'x');
      const y = clampToMap(world, command.y, 'y');
      const slots = computeFormation(units, x, y, command.formation ?? 'auto', world.nav);
      units.forEach((unit, index) => {
        const slot = slots[index]!;
        world.giveOrder(unit, { type: command.type, x: slot.x, y: slot.y, targetId: 0 }, command.queue === true);
      });
      return;
    }
    case 'attack': {
      const target = world.entities.get(command.target);
      const team = world.player(player)?.team ?? -1;
      if (!target || !target.alive || target.owner < 0 || target.team === team || !world.isVisibleToTeam(team, target)) {
        return;
      }
      for (const unit of ownedUnits(world, player, command.units)) {
        if (attackRange(world, unit, target) > 0) {
          world.giveOrder(unit, { type: 'attack', x: target.x, y: target.y, targetId: target.id }, command.queue === true);
        }
      }
      return;
    }
    case 'stop':
    case 'hold':
    case 'guard':
      for (const unit of ownedUnits(world, player, command.units)) {
        world.giveOrder(unit, { type: command.type === 'stop' ? 'idle' : command.type, x: unit.x, y: unit.y, targetId: 0 }, false);
        unit.moving = false;
      }
      return;
    case 'build': {
      const builders = ownedUnits(world, player, command.units).filter((u) => u.unitDef!.canConstruct);
      if (builders.length === 0) {
        return;
      }
      const problem = world.placementProblem(player, command.building, command.x, command.y, command.rotated === true);
      if (problem) {
        world.notice(player, problem, command.x, command.y);
        return;
      }
      const def = world.data.building(command.building);
      if ((world.player(player)?.credits ?? 0) < def.cost) {
        world.notice(player, 'insufficientFunds');
        return;
      }
      const site = world.snapFootprint(def, command.x, command.y, command.rotated === true);
      for (const builder of builders) {
        world.giveOrder(
          builder,
          { type: 'construct', x: site.x, y: site.y, targetId: 0, buildingDefId: def.id, rotated: command.rotated === true },
          false,
        );
      }
      return;
    }
    case 'repair': {
      const target = world.entities.get(command.target);
      if (!target || !target.alive || target.kind !== 'building' || target.owner !== player) {
        return;
      }
      for (const builder of ownedUnits(world, player, command.units).filter((u) => u.unitDef!.canConstruct)) {
        world.giveOrder(builder, { type: target.complete ? 'repair' : 'construct', x: target.x, y: target.y, targetId: target.id }, false);
      }
      return;
    }
    case 'harvest': {
      const field = world.entities.get(command.target);
      if (!field || !field.alive || field.kind !== 'resource') {
        return;
      }
      for (const truck of ownedUnits(world, player, command.units).filter((u) => u.unitDef!.class === 'Harvester')) {
        world.giveOrder(truck, { type: 'harvest', x: field.x, y: field.y, targetId: field.id }, false);
      }
      return;
    }
    case 'produce': {
      const building = ownedBuilding(world, player, command.building);
      if (!building || !building.complete || !building.buildingDef!.produces.includes(command.unit)) {
        return;
      }
      const unitDef = world.data.unit(command.unit);
      if (!world.hasPrerequisites(player, unitDef.prerequisites)) {
        world.notice(player, 'requirementsMissing');
        return;
      }
      for (let i = 0; i < (command.count ?? 1); i++) {
        if (building.queue.length >= MAX_QUEUE) {
          world.notice(player, 'queueFull');
          return;
        }
        if (!world.trySpend(player, unitDef.cost)) {
          world.notice(player, 'insufficientFunds');
          return;
        }
        building.queue.push({ unitId: unitDef.id, progress: 0, totalTicks: world.ticks(unitDef.buildTime), cost: unitDef.cost });
      }
      return;
    }
    case 'cancel': {
      const building = ownedBuilding(world, player, command.building);
      const item = building?.queue[command.index];
      if (building && item) {
        building.queue.splice(command.index, 1);
        world.refund(player, item.cost);
      }
      return;
    }
    case 'rally': {
      const building = ownedBuilding(world, player, command.building);
      if (building) {
        building.rallyX = clampToMap(world, command.x, 'x');
        building.rallyY = clampToMap(world, command.y, 'y');
        building.hasRally = true;
      }
      return;
    }
    case 'sell': {
      const building = ownedBuilding(world, player, command.building);
      if (building) {
        world.sell(building);
      }
      return;
    }
    case 'surrender': {
      const state = world.player(player);
      if (state && !state.defeated) {
        defeatPlayer(world, player);
      }
      return;
    }
  }
}

export function defeatPlayer(world: World, player: number): void {
  const state = world.player(player);
  if (!state) {
    return;
  }
  state.defeated = true;
  world.events.push({ type: 'defeated', player });
  for (const entity of world.entities.values()) {
    if (entity.alive && entity.owner === player) {
      world.kill(entity, null);
    }
  }
}

function ownedUnits(world: World, player: number, ids: number[]): Entity[] {
  const units: Entity[] = [];
  for (const id of ids) {
    const entity = world.entities.get(id);
    if (entity && entity.alive && entity.kind === 'unit' && entity.owner === player) {
      units.push(entity);
    }
  }
  return units;
}

function ownedBuilding(world: World, player: number, id: number): Entity | undefined {
  const entity = world.entities.get(id);
  return entity && entity.alive && entity.kind === 'building' && entity.owner === player ? entity : undefined;
}

function clampToMap(world: World, value: number, axis: 'x' | 'y'): number {
  const limit = axis === 'x' ? world.map.width : world.map.height;
  return Math.min(limit - 5, Math.max(5, value));
}

// ------------------------------------------------------------------ per-tick order logic

/** Runs every unit's current order: target acquisition, movement goals, construction, harvesting. */
export function updateOrders(world: World): void {
  for (const unit of world.entities.values()) {
    if (!unit.alive || unit.kind !== 'unit') {
      continue;
    }
    const order = unit.order;
    switch (order.type) {
      case 'idle':
      case 'guard':
      case 'hold':
        updateStationary(world, unit, order);
        break;
      case 'move':
        updateMove(world, unit, order);
        break;
      case 'attackMove':
        updateAttackMove(world, unit, order);
        break;
      case 'attack':
        updateAttack(world, unit, order);
        break;
      case 'construct':
        updateConstruct(world, unit, order);
        break;
      case 'repair':
        updateRepair(world, unit, order);
        break;
      case 'harvest':
        updateHarvest(world, unit, order);
        break;
    }
  }
}

function shouldScan(world: World, unit: Entity): boolean {
  return (world.tick + unit.id) % ACQUIRE_INTERVAL === 0;
}

function refreshTarget(world: World, unit: Entity, radius: number): Entity | undefined {
  const current = world.entities.get(unit.targetId);
  if (isValidTarget(world, unit, current) && edgeDistance(unit, current) <= radius + 4) {
    return current;
  }
  unit.targetId = 0;
  if (unit.weapons.length === 0 || !shouldScan(world, unit)) {
    return undefined;
  }
  const found = findTarget(world, unit, radius);
  unit.targetId = found?.id ?? 0;
  return found;
}

function updateStationary(world: World, unit: Entity, order: Order): void {
  const def = unit.unitDef!;
  if (order.type === 'idle' && def.class === 'Harvester' && (world.tick + unit.id) % 30 === 0) {
    const field = nearestField(world, unit);
    if (field) {
      world.giveOrder(unit, { type: 'harvest', x: field.x, y: field.y, targetId: field.id }, false);
      return;
    }
  }
  const range = maxWeaponRange(unit);
  if (range === 0) {
    stopMoving(unit);
    return;
  }
  const leash = order.type === 'hold' ? 0 : order.type === 'guard' ? GUARD_CHASE_LEASH : IDLE_CHASE_LEASH;
  const target = refreshTarget(world, unit, range + leash * 0.5);
  if (target) {
    const inRange = edgeDistance(unit, target) <= attackRange(world, unit, target);
    const leashOk = Math.hypot(target.x - unit.guardX, target.y - unit.guardY) <= range + leash;
    if (inRange || order.type === 'hold') {
      stopMoving(unit);
    } else if (leashOk) {
      moveToward(world, unit, target.x, target.y);
    } else {
      unit.targetId = 0;
    }
    return;
  }
  // Return to the guard position after a chase.
  if (order.type !== 'hold' && Math.hypot(unit.x - unit.guardX, unit.y - unit.guardY) > 4) {
    moveToward(world, unit, unit.guardX, unit.guardY);
  } else {
    stopMoving(unit);
  }
}

function updateMove(world: World, unit: Entity, order: Order): void {
  // Turreted weapons fire on the move at anything in range; nobody chases.
  if (unit.weapons.some((w) => w.mount.turreted)) {
    refreshTarget(world, unit, maxWeaponRange(unit));
  } else {
    unit.targetId = 0;
  }
  if (followTo(world, unit, order.x, order.y)) {
    finishMovement(world, unit);
  }
}

function updateAttackMove(world: World, unit: Entity, order: Order): void {
  const range = maxWeaponRange(unit);
  const target = range > 0 ? refreshTarget(world, unit, range + ATTACK_MOVE_SCAN_BONUS) : undefined;
  if (target) {
    if (edgeDistance(unit, target) <= attackRange(world, unit, target)) {
      stopMoving(unit);
    } else {
      moveToward(world, unit, target.x, target.y);
    }
    return;
  }
  if (followTo(world, unit, order.x, order.y)) {
    finishMovement(world, unit);
  }
}

function updateAttack(world: World, unit: Entity, order: Order): void {
  const target = world.entities.get(order.targetId);
  if (!isValidTarget(world, unit, target)) {
    unit.targetId = 0;
    world.completeOrder(unit);
    return;
  }
  unit.targetId = target.id;
  const range = attackRange(world, unit, target);
  const distance = edgeDistance(unit, target);
  const minRange = Math.max(0, ...unit.weapons.map((w) => w.def.minRange ?? 0));
  if (distance <= range && distance >= minRange) {
    stopMoving(unit);
  } else if (distance < minRange) {
    const away = Math.atan2(unit.y - target.y, unit.x - target.x);
    moveToward(world, unit, target.x + Math.cos(away) * (minRange + 6), target.y + Math.sin(away) * (minRange + 6));
  } else {
    moveToward(world, unit, target.x, target.y);
  }
}

function updateConstruct(world: World, unit: Entity, order: Order): void {
  let site = order.targetId ? world.entities.get(order.targetId) : undefined;
  if (order.targetId && (!site || !site.alive || site.complete)) {
    world.completeOrder(unit);
    return;
  }
  if (!site) {
    const def = world.data.building(order.buildingDefId ?? '');
    const reach = Math.hypot(def.width, def.depth) / 2 + unit.radius + BUILD_REACH;
    if (Math.hypot(order.x - unit.x, order.y - unit.y) > reach) {
      moveToward(world, unit, order.x, order.y, reach - 1);
      return;
    }
    stopMoving(unit);
    site = existingSite(world, unit.owner, def.id, order.x, order.y);
    if (!site) {
      const problem = world.placementProblem(unit.owner, def.id, order.x, order.y, order.rotated === true, unit.id);
      if (problem) {
        world.notice(unit.owner, problem, order.x, order.y);
        world.completeOrder(unit);
        return;
      }
      if (!world.trySpend(unit.owner, def.cost)) {
        world.notice(unit.owner, 'insufficientFunds');
        world.completeOrder(unit);
        return;
      }
      site = world.spawnBuilding(def.id, unit.owner, order.x, order.y, order.rotated === true, false);
    }
    order.targetId = site.id;
  }
  if (edgeDistance(unit, site) > unit.radius + BUILD_REACH) {
    moveToward(world, unit, site.x, site.y, site.radius + unit.radius + 1);
    return;
  }
  stopMoving(unit);
  const def = site.buildingDef!;
  const step = 1 / world.ticks(def.buildTime);
  site.constructionProgress = Math.min(1, site.constructionProgress + step);
  site.hp = Math.min(site.maxHp, site.hp + site.maxHp * 0.9 * step);
  if (site.constructionProgress >= 1) {
    completeConstruction(world, site);
    world.completeOrder(unit);
  }
}

function completeConstruction(world: World, site: Entity): void {
  const def = site.buildingDef!;
  site.complete = true;
  site.constructionProgress = 1;
  world.events.push({ type: 'built', id: site.id, owner: site.owner, defId: def.id });
  world.notice(site.owner, 'constructionComplete', site.x, site.y);
  const player = world.player(site.owner);
  if (player) {
    player.stats.structuresBuilt++;
  }
  if (def.freeUnit) {
    spawnFromBuilding(world, site, def.freeUnit);
  }
}

/** Spawns a unit at a structure's exit and sends it to the rally point. */
export function spawnFromBuilding(world: World, building: Entity, unitId: string): Entity {
  const def = building.buildingDef!;
  const depth = (building.rotated ? def.width : def.depth) / 2;
  const exit = world.nav.nearestWalkable(building.x, building.y - depth - 3) ?? { x: building.x, y: building.y - depth - 3 };
  const unit = world.spawnUnit(unitId, building.owner, exit.x, exit.y, -Math.PI / 2);
  const player = world.player(building.owner);
  if (player) {
    player.stats.unitsProduced++;
  }
  world.events.push({ type: 'produced', id: unit.id, owner: unit.owner, defId: unitId });
  if (unit.unitDef!.class === 'Harvester') {
    const field = nearestField(world, unit);
    if (field) {
      world.giveOrder(unit, { type: 'harvest', x: field.x, y: field.y, targetId: field.id }, false);
      return unit;
    }
  }
  const rally = { x: building.rallyX, y: building.rallyY };
  const spot = world.nav.nearestWalkable(rally.x + world.rng.range(-3, 3), rally.y + world.rng.range(-3, 3)) ?? rally;
  world.giveOrder(unit, { type: 'move', x: spot.x, y: spot.y, targetId: 0 }, false);
  return unit;
}

function existingSite(world: World, owner: number, defId: string, x: number, y: number): Entity | undefined {
  for (const entity of world.entities.values()) {
    if (entity.alive && entity.kind === 'building' && entity.owner === owner && entity.defId === defId && !entity.complete) {
      if (Math.abs(entity.x - x) < 1 && Math.abs(entity.y - y) < 1) {
        return entity;
      }
    }
  }
  return undefined;
}

function updateRepair(world: World, unit: Entity, order: Order): void {
  const target = world.entities.get(order.targetId);
  if (!target || !target.alive || target.owner !== unit.owner || target.hp >= target.maxHp) {
    world.completeOrder(unit);
    return;
  }
  if (edgeDistance(unit, target) > unit.radius + BUILD_REACH) {
    moveToward(world, unit, target.x, target.y, target.radius + unit.radius + 1);
    return;
  }
  stopMoving(unit);
  target.hp = Math.min(target.maxHp, target.hp + (target.maxHp * REPAIR_FRACTION_PER_SECOND) / world.ticks(1));
}

function updateHarvest(world: World, unit: Entity, order: Order): void {
  const def = unit.unitDef!;
  const capacity = def.harvestCapacity ?? 0;
  if (unit.harvestPhase === 'toDepot') {
    const depot = nearestDepot(world, unit);
    if (!depot) {
      stopMoving(unit);
      return;
    }
    if (edgeDistance(unit, depot) > unit.radius + DEPOT_REACH) {
      moveToward(world, unit, depot.x, depot.y, depot.radius + unit.radius + 1);
      return;
    }
    stopMoving(unit);
    const player = world.player(unit.owner);
    if (player && unit.cargo > 0) {
      player.credits += unit.cargo;
      player.stats.creditsEarned += unit.cargo;
    }
    unit.cargo = 0;
    unit.harvestPhase = 'toField';
    return;
  }

  let field = world.entities.get(order.targetId);
  if (!field || !field.alive || field.supply <= 0) {
    field = nearestField(world, unit);
    if (!field) {
      if (unit.cargo > 0) {
        unit.harvestPhase = 'toDepot';
      } else {
        world.completeOrder(unit);
      }
      return;
    }
    order.targetId = field.id;
    order.x = field.x;
    order.y = field.y;
  }

  if (unit.harvestPhase === 'toField') {
    if (Math.hypot(field.x - unit.x, field.y - unit.y) > HARVEST_REACH + field.radius) {
      moveToward(world, unit, field.x, field.y, HARVEST_REACH + field.radius - 1);
      return;
    }
    stopMoving(unit);
    unit.harvestPhase = 'loading';
    unit.harvestTimer = world.ticks(def.harvestTime ?? 1);
    return;
  }

  // loading
  stopMoving(unit);
  unit.harvestTimer--;
  if (unit.harvestTimer <= 0) {
    const amount = Math.min(capacity, field.supply);
    field.supply -= amount;
    unit.cargo += amount;
    unit.harvestPhase = 'toDepot';
    if (field.supply <= 0) {
      world.notice(unit.owner, 'supplyDepleted', field.x, field.y);
      world.kill(field, null);
    }
  }
}

function nearestField(world: World, unit: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = Infinity;
  for (const entity of world.entities.values()) {
    if (entity.alive && entity.kind === 'resource' && entity.supply > 0) {
      const d = Math.hypot(entity.x - unit.x, entity.y - unit.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = entity;
      }
    }
  }
  return best;
}

function nearestDepot(world: World, unit: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestDistance = Infinity;
  for (const entity of world.entities.values()) {
    if (entity.alive && entity.kind === 'building' && entity.owner === unit.owner && entity.complete && entity.buildingDef?.supplyDropOff) {
      const d = Math.hypot(entity.x - unit.x, entity.y - unit.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = entity;
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ movement helpers

function stopMoving(unit: Entity): void {
  unit.moving = false;
}

/** Moves toward a point, repathing when the goal drifts. Returns true once within `arrive` metres. */
function moveToward(world: World, unit: Entity, x: number, y: number, arrive = ARRIVAL_DISTANCE): boolean {
  if (Math.hypot(x - unit.x, y - unit.y) <= arrive) {
    unit.moving = false;
    return true;
  }
  unit.moving = true;
  const drift = Math.hypot(x - unit.pathGoalX, y - unit.pathGoalY);
  if ((unit.path.length === 0 && !unit.pathPending) || drift > REPATH_TARGET_DRIFT) {
    world.requestPath(unit, x, y);
  }
  return false;
}

/**
 * Follows a path to an order destination. Arrival is exact when possible; when the path is exhausted or the
 * unit makes no progress (crowded formation slot), it settles within a loose radius instead of jostling forever.
 */
function followTo(world: World, unit: Entity, x: number, y: number): boolean {
  const remaining = Math.hypot(x - unit.x, y - unit.y);
  if (remaining <= ARRIVAL_DISTANCE) {
    return true;
  }
  if (remaining < unit.lastProgressDistance - 0.3) {
    unit.lastProgressDistance = remaining;
    unit.stuckTicks = 0;
  } else {
    unit.stuckTicks++;
  }
  const pathDone = unit.path.length > 0 && unit.pathIndex >= unit.path.length && !unit.pathPending;
  if ((pathDone || unit.stuckTicks > GIVE_UP_STUCK_TICKS / 2) && remaining <= LOOSE_ARRIVAL_DISTANCE) {
    return true;
  }
  if (unit.stuckTicks > GIVE_UP_STUCK_TICKS) {
    unit.stuckTicks = 0;
    unit.lastProgressDistance = Infinity;
    unit.path = [];
    if (remaining <= LOOSE_ARRIVAL_DISTANCE * 3) {
      return true;
    }
  }
  if (pathDone) {
    unit.path = [];
  }
  moveToward(world, unit, x, y);
  return false;
}

function finishMovement(world: World, unit: Entity): void {
  unit.moving = false;
  world.completeOrder(unit);
}
