import { SPATIAL_CELL_SIZE } from '../constants';
import type { Entity } from './entity';

/** Largest entity radius the grid must account for (biggest structure half-extent). */
const MAX_ENTITY_RADIUS = 12;

/**
 * Uniform spatial hash rebuilt once per tick. Neighbour, targeting and splash queries touch only nearby
 * buckets instead of every entity, which keeps those systems roughly linear in entity count.
 */
export class SpatialGrid {
  private readonly columns: number;
  private readonly rows: number;
  private readonly buckets: Entity[][];

  constructor(width: number, height: number) {
    this.columns = Math.ceil(width / SPATIAL_CELL_SIZE) + 1;
    this.rows = Math.ceil(height / SPATIAL_CELL_SIZE) + 1;
    this.buckets = Array.from({ length: this.columns * this.rows }, () => []);
  }

  rebuild(entities: Iterable<Entity>): void {
    for (const bucket of this.buckets) {
      bucket.length = 0;
    }
    for (const entity of entities) {
      if (entity.alive) {
        this.buckets[this.bucketIndex(entity.x, entity.y)]!.push(entity);
      }
    }
  }

  /** Calls `visit` for every entity whose centre lies within `radius` (+ its own radius) of (x, y). */
  query(x: number, y: number, radius: number, visit: (entity: Entity) => void): void {
    const reach = radius + MAX_ENTITY_RADIUS;
    const minC = this.clampColumn(Math.floor((x - reach) / SPATIAL_CELL_SIZE));
    const maxC = this.clampColumn(Math.floor((x + reach) / SPATIAL_CELL_SIZE));
    const minR = this.clampRow(Math.floor((y - reach) / SPATIAL_CELL_SIZE));
    const maxR = this.clampRow(Math.floor((y + reach) / SPATIAL_CELL_SIZE));
    for (let row = minR; row <= maxR; row++) {
      for (let column = minC; column <= maxC; column++) {
        for (const entity of this.buckets[row * this.columns + column]!) {
          const limit = radius + entity.radius;
          const dx = entity.x - x;
          const dy = entity.y - y;
          if (entity.alive && dx * dx + dy * dy <= limit * limit) {
            visit(entity);
          }
        }
      }
    }
  }

  private bucketIndex(x: number, y: number): number {
    return this.clampRow(Math.floor(y / SPATIAL_CELL_SIZE)) * this.columns + this.clampColumn(Math.floor(x / SPATIAL_CELL_SIZE));
  }

  private clampColumn(c: number): number {
    return c < 0 ? 0 : c >= this.columns ? this.columns - 1 : c;
  }

  private clampRow(r: number): number {
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }
}
