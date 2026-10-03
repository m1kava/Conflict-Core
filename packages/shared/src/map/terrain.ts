import { NAV_CELL_SIZE } from '../constants';
import { distance, distanceToSegment, smoothstep, wrapAngle } from '../math/geometry';
import { fractalNoise } from '../math/noise';
import type { MapDef } from './mapDef';

/** Maximum walkable slope (rise over run) for ground units. */
const MAX_WALKABLE_SLOPE = 0.85;
const CLIFF_EDGE_WIDTH = 3;
const RAMP_EDGE_WIDTH = 24;
const RAMP_HALF_ANGLE = 0.3;
const BORDER_BLOCK = 4;

/**
 * Analytic terrain derived from map features. The same function feeds server passability (navigation grid)
 * and client rendering, so there is no heightmap asset to keep in sync.
 */
export class Terrain {
  readonly navWidth: number;
  readonly navHeight: number;
  /** 1 where ground units can never go (water, cliffs, borders). */
  readonly blocked: Uint8Array;

  constructor(readonly map: MapDef) {
    this.navWidth = Math.ceil(map.width / NAV_CELL_SIZE);
    this.navHeight = Math.ceil(map.height / NAV_CELL_SIZE);
    this.blocked = new Uint8Array(this.navWidth * this.navHeight);
    this.computePassability();
  }

  /** Ground height in metres at a world position. */
  heightAt(x: number, y: number): number {
    const map = this.map;
    let plateauFactor = 0;
    let height = 0;

    for (const plateau of map.plateaus) {
      const d = distance(x, y, plateau.x, plateau.y);
      const angle = Math.atan2(y - plateau.y, x - plateau.x);
      let rampBlend = 0;
      for (const ramp of plateau.ramps) {
        const off = Math.abs(wrapAngle(angle - ramp));
        rampBlend = Math.max(rampBlend, 1 - smoothstep(RAMP_HALF_ANGLE * 0.6, RAMP_HALF_ANGLE, off));
      }
      const edge = CLIFF_EDGE_WIDTH + (RAMP_EDGE_WIDTH - CLIFF_EDGE_WIDTH) * rampBlend;
      const factor = 1 - smoothstep(plateau.radius, plateau.radius + edge, d);
      plateauFactor = Math.max(plateauFactor, factor);
      height += plateau.height * factor;
    }

    const rolling = fractalNoise(x / 55, y / 55, map.seed, 4) * 4.5 - 1.2;
    height += rolling * (1 - plateauFactor * 0.85);

    for (const hill of map.hills) {
      const t = 1 - smoothstep(0, hill.radius, distance(x, y, hill.x, hill.y));
      height += hill.height * t * t * (3 - 2 * t) * 0.9;
    }

    const river = map.river;
    if (river) {
      const d = this.distanceToRiver(x, y);
      const carve = 1 - smoothstep(river.width * 0.5 - 2, river.width * 0.5 + 7, d);
      let depth = river.depth;
      for (const crossing of river.crossings) {
        if (!crossing.bridge) {
          const near = 1 - smoothstep(crossing.radius * 0.6, crossing.radius * 1.6, distance(x, y, crossing.x, crossing.y));
          depth -= (river.depth - 0.7) * near;
        }
      }
      // Pull the river bed toward a flat level so it does not inherit hills and noise.
      height = height * (1 - carve) + (map.waterLevel - depth + 1) * carve;
    }
    return height;
  }

  distanceToRiver(x: number, y: number): number {
    const river = this.map.river;
    if (!river) {
      return Infinity;
    }
    let best = Infinity;
    for (let i = 0; i + 1 < river.points.length; i++) {
      const a = river.points[i]!;
      const b = river.points[i + 1]!;
      best = Math.min(best, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
    }
    return best;
  }

  /** True for water the ground cannot cross (fords and the bridge are excluded). */
  isDeepWater(x: number, y: number): boolean {
    const river = this.map.river;
    if (!river || this.distanceToRiver(x, y) > river.width * 0.5) {
      return false;
    }
    return !river.crossings.some((c) => distance(x, y, c.x, c.y) <= c.radius);
  }

  /** Approximate slope (rise over run) using central differences. */
  slopeAt(x: number, y: number): number {
    const step = 1;
    const dx = (this.heightAt(x + step, y) - this.heightAt(x - step, y)) / (2 * step);
    const dy = (this.heightAt(x, y + step) - this.heightAt(x, y - step)) / (2 * step);
    return Math.sqrt(dx * dx + dy * dy);
  }

  isOnBridge(x: number, y: number): boolean {
    return this.map.river?.crossings.some((c) => c.bridge && distance(x, y, c.x, c.y) <= c.radius + 6) ?? false;
  }

  cellIndex(cx: number, cy: number): number {
    return cy * this.navWidth + cx;
  }

  isTerrainBlocked(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.navWidth || cy >= this.navHeight) {
      return true;
    }
    return this.blocked[this.cellIndex(cx, cy)] === 1;
  }

  private computePassability(): void {
    const map = this.map;
    for (let cy = 0; cy < this.navHeight; cy++) {
      for (let cx = 0; cx < this.navWidth; cx++) {
        const x = (cx + 0.5) * NAV_CELL_SIZE;
        const y = (cy + 0.5) * NAV_CELL_SIZE;
        const border = x < BORDER_BLOCK || y < BORDER_BLOCK || x > map.width - BORDER_BLOCK || y > map.height - BORDER_BLOCK;
        const bridge = this.isOnBridge(x, y) && this.distanceToRiver(x, y) < (map.river?.width ?? 0);
        const blocked = border || this.isDeepWater(x, y) || (!bridge && this.slopeAt(x, y) > MAX_WALKABLE_SLOPE);
        this.blocked[this.cellIndex(cx, cy)] = blocked ? 1 : 0;
      }
    }
  }
}
