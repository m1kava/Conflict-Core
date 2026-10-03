export interface Point {
  x: number;
  y: number;
}

export const TWO_PI = Math.PI * 2;

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSquared(ax, ay, bx, by));
}

/** Wraps an angle into [-π, π). */
export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % TWO_PI;
  if (a < 0) {
    a += TWO_PI;
  }
  return a - Math.PI;
}

/** Rotates `current` toward `target` by at most `maxDelta` radians. */
export function rotateTowards(current: number, target: number, maxDelta: number): number {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return wrapAngle(current + Math.sign(delta) * maxDelta);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest distance from point P to segment AB. */
export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
  return distance(px, py, ax + abx * t, ay + aby * t);
}
