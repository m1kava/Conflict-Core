import type { Point } from '../math/geometry';
import type { FormationKind } from './commands';
import type { Entity } from './entity';
import type { NavGrid } from './navigation';

/**
 * Destination slots for a group move so units spread out instead of piling onto one point. Slots face the
 * direction of travel; spacing comes from the largest unit radius in the group. Units are assigned to the
 * nearest free slot (front rows first), which keeps paths from crossing in the common case.
 */
export function computeFormation(units: Entity[], x: number, y: number, kind: FormationKind, nav: NavGrid): Point[] {
  if (units.length === 1) {
    return [nav.nearestWalkable(x, y) ?? { x, y }];
  }
  let cx = 0;
  let cy = 0;
  let maxRadius = 0;
  for (const unit of units) {
    cx += unit.x;
    cy += unit.y;
    maxRadius = Math.max(maxRadius, unit.radius);
  }
  cx /= units.length;
  cy /= units.length;
  let fx = x - cx;
  let fy = y - cy;
  const length = Math.hypot(fx, fy);
  if (length < 0.001) {
    fx = 0;
    fy = 1;
  } else {
    fx /= length;
    fy /= length;
  }
  const rx = fy;
  const ry = -fx;

  const spacing = maxRadius * 2 + (kind === 'spread' ? 6 : 1.6);
  const offsets = slotOffsets(units.length, kind);
  const slots = offsets.map((o) => ({ x: x + (rx * o.x - fx * o.y) * spacing, y: y + (ry * o.x - fy * o.y) * spacing }));

  const assigned: Point[] = new Array<Point>(units.length);
  const free = units.map((_, i) => i);
  for (const slot of slots) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < free.length; i++) {
      const unit = units[free[i]!]!;
      const d = (unit.x - slot.x) ** 2 + (unit.y - slot.y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    const unitIndex = free.splice(bestIndex, 1)[0]!;
    assigned[unitIndex] = nav.nearestWalkable(slot.x, slot.y) ?? slot;
  }
  return assigned;
}

/** Slot offsets in spacing units: x = lateral (right positive), y = depth behind the front row. */
function slotOffsets(count: number, kind: FormationKind): Point[] {
  const offsets: Point[] = [];
  if (kind === 'wedge') {
    for (let row = 0; offsets.length < count; row++) {
      for (let i = 0; i <= row && offsets.length < count; i++) {
        offsets.push({ x: i - row / 2, y: row });
      }
    }
    return offsets;
  }
  const columns = kind === 'line' ? Math.min(count, 12) : Math.ceil(Math.sqrt(count * 1.6));
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, count - row * columns);
    offsets.push({ x: (i % columns) - (inRow - 1) / 2, y: row });
  }
  return offsets;
}
