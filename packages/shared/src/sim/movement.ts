import { TICK_SECONDS } from '../constants';
import { rotateTowards, wrapAngle } from '../math/geometry';
import type { Entity } from './entity';
import type { World } from './world';

/**
 * A* node expansions allowed per tick (roughly 3-4 cross-map searches). Work-based rather than time-based so
 * the simulation stays deterministic; requests beyond the budget wait for the next tick.
 */
const PATH_EXPANSION_BUDGET = 14000;
/** Group members whose start and goal lie this close to an already computed path reuse it. */
const SHARE_START_RADIUS = 12;
const SHARE_GOAL_RADIUS = 20;

interface ComputedPath {
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  path: number[];
}
const WAYPOINT_REACHED = 1.0;
const DEG_TO_RAD = Math.PI / 180;
/** Heading error above which vehicles slow down to turn. */
const SLOW_TURN_ANGLE = 0.9;
const SEPARATION_STRENGTH = 0.5;

export function processPathRequests(world: World): void {
  let spent = 0;
  const computed: ComputedPath[] = [];
  while (spent < PATH_EXPANSION_BUDGET && world.pathQueue.length > 0) {
    const id = world.pathQueue.shift()!;
    const unit = world.entities.get(id);
    if (!unit || !unit.alive || !unit.pathPending) {
      continue;
    }
    const shared = sharePath(world, unit, computed);
    if (shared) {
      unit.path = shared;
    } else {
      unit.path = world.nav.findPath(unit.x, unit.y, unit.pathGoalX, unit.pathGoalY);
      spent += world.nav.lastExpansions;
      computed.push({ sx: unit.x, sy: unit.y, gx: unit.pathGoalX, gy: unit.pathGoalY, path: unit.path });
    }
    unit.pathIndex = 0;
    unit.pathPending = false;
  }
}

/**
 * Reuses a path computed this tick for a nearby unit heading to a nearby goal (typical for group orders):
 * same corridor, own final destination. Valid only if both ends connect by straight walkable lines.
 */
function sharePath(world: World, unit: Entity, computed: ComputedPath[]): number[] | null {
  for (const candidate of computed) {
    if (
      candidate.path.length < 4 ||
      Math.hypot(candidate.sx - unit.x, candidate.sy - unit.y) > SHARE_START_RADIUS ||
      Math.hypot(candidate.gx - unit.pathGoalX, candidate.gy - unit.pathGoalY) > SHARE_GOAL_RADIUS
    ) {
      continue;
    }
    const path = candidate.path.slice();
    const last = path.length - 2;
    path[last] = unit.pathGoalX;
    path[last + 1] = unit.pathGoalY;
    const nav = world.nav;
    if (
      nav.hasLineOfSight(unit.x, unit.y, path[0]!, path[1]!) &&
      nav.isWalkableWorld(unit.pathGoalX, unit.pathGoalY) &&
      nav.hasLineOfSight(path[last - 2]!, path[last - 1]!, unit.pathGoalX, unit.pathGoalY)
    ) {
      return path;
    }
  }
  return null;
}

/** Advances every moving unit along its path, then resolves overlaps. */
export function moveUnits(world: World): void {
  for (const unit of world.entities.values()) {
    if (unit.alive && unit.kind === 'unit') {
      moveUnit(world, unit);
    }
  }
  separate(world);
}

function moveUnit(world: World, unit: Entity): void {
  const def = unit.unitDef!;
  const movement = def.movement;
  const maxSpeed = movement.speed * (world.veterancyLevel(unit).speedMultiplier ?? 1);
  const turnRate = movement.turnRate * DEG_TO_RAD * TICK_SECONDS;

  const hasWaypoint = unit.moving && unit.pathIndex < unit.path.length;
  if (!hasWaypoint) {
    unit.speed = Math.max(0, unit.speed - movement.acceleration * 2 * TICK_SECONDS);
    if (!unit.moving) {
      unit.speed = 0;
    }
    faceTargetWhenIdle(world, unit, turnRate);
    return;
  }

  const wx = unit.path[unit.pathIndex]!;
  const wy = unit.path[unit.pathIndex + 1]!;
  const dx = wx - unit.x;
  const dy = wy - unit.y;
  const distanceToWaypoint = Math.hypot(dx, dy);
  if (distanceToWaypoint <= Math.max(WAYPOINT_REACHED, unit.speed * TICK_SECONDS)) {
    unit.pathIndex += 2;
    if (unit.pathIndex >= unit.path.length) {
      unit.x = clampPosition(world, wx, unit, 'x');
      unit.y = clampPosition(world, wy, unit, 'y');
    }
    return;
  }

  const desired = Math.atan2(dy, dx);
  unit.heading = rotateTowards(unit.heading, desired, turnRate);
  const error = Math.abs(wrapAngle(desired - unit.heading));
  const infantry = movement.locomotor === 'Foot';
  let targetSpeed = maxSpeed;
  if (!infantry && error > SLOW_TURN_ANGLE) {
    targetSpeed = movement.locomotor === 'Tracked' ? 0 : maxSpeed * 0.3;
  }
  // Ease in on the final waypoint so units stop instead of overshooting.
  if (unit.pathIndex + 2 >= unit.path.length) {
    targetSpeed = Math.min(targetSpeed, Math.max(1.5, distanceToWaypoint * 1.5));
  }
  const acceleration = movement.acceleration * TICK_SECONDS;
  unit.speed = unit.speed < targetSpeed ? Math.min(targetSpeed, unit.speed + acceleration) : Math.max(targetSpeed, unit.speed - acceleration * 2);

  const step = unit.speed * TICK_SECONDS;
  const direction = infantry ? desired : unit.heading;
  tryMove(world, unit, Math.cos(direction) * step, Math.sin(direction) * step);
}

/** Moves if the destination cell is walkable, otherwise slides along whichever axis is free. */
function tryMove(world: World, unit: Entity, mx: number, my: number): void {
  const nav = world.nav;
  if (nav.isWalkableWorld(unit.x + mx, unit.y + my)) {
    unit.x += mx;
    unit.y += my;
  } else if (nav.isWalkableWorld(unit.x + mx, unit.y)) {
    unit.x += mx;
  } else if (nav.isWalkableWorld(unit.x, unit.y + my)) {
    unit.y += my;
  } else {
    unit.speed = 0;
    unit.path = [];
  }
}

/** Stationary units with a fixed weapon turn the hull toward their target. */
function faceTargetWhenIdle(world: World, unit: Entity, turnRate: number): void {
  if (unit.targetId === 0) {
    return;
  }
  const target = world.entities.get(unit.targetId);
  if (!target || unit.weapons.every((w) => w.mount.turreted)) {
    return;
  }
  unit.heading = rotateTowards(unit.heading, Math.atan2(target.y - unit.y, target.x - unit.x), turnRate);
}

/**
 * Pairwise overlap resolution using the spatial grid. Moving units push stationary ones aside (stationary
 * units yield), which lets groups flow through each other instead of deadlocking.
 */
function separate(world: World): void {
  for (const unit of world.entities.values()) {
    if (!unit.alive || unit.kind !== 'unit') {
      continue;
    }
    world.spatial.query(unit.x, unit.y, unit.radius, (other) => {
      if (other === unit || other.kind !== 'unit' || other.id < unit.id) {
        return;
      }
      const dx = other.x - unit.x;
      const dy = other.y - unit.y;
      const minDistance = unit.radius + other.radius;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= minDistance * minDistance) {
        return;
      }
      const d = Math.sqrt(distanceSq);
      const nx = d > 0.0001 ? dx / d : Math.cos(unit.id);
      const ny = d > 0.0001 ? dy / d : Math.sin(unit.id);
      const overlap = (minDistance - d) * SEPARATION_STRENGTH;
      const unitShare = unit.moving && !other.moving ? 0.2 : !unit.moving && other.moving ? 0.8 : 0.5;
      nudge(world, unit, -nx * overlap * unitShare, -ny * overlap * unitShare);
      nudge(world, other, nx * overlap * (1 - unitShare), ny * overlap * (1 - unitShare));
    });
  }
  for (const unit of world.entities.values()) {
    if (unit.alive && unit.kind === 'unit' && !world.nav.isWalkableWorld(unit.x, unit.y)) {
      const free = world.nav.nearestWalkable(unit.x, unit.y, 12);
      if (free) {
        unit.x = free.x;
        unit.y = free.y;
      }
    }
  }
}

function nudge(world: World, unit: Entity, dx: number, dy: number): void {
  if (world.nav.isWalkableWorld(unit.x + dx, unit.y + dy)) {
    unit.x += dx;
    unit.y += dy;
  }
}

function clampPosition(world: World, value: number, unit: Entity, axis: 'x' | 'y'): number {
  const limit = axis === 'x' ? world.map.width : world.map.height;
  return Math.min(limit - unit.radius, Math.max(unit.radius, value));
}
