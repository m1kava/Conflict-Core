import { NAV_CELL_SIZE } from '../constants';
import type { Terrain } from '../map/terrain';

const SQRT2 = Math.SQRT2;
const MAX_EXPANSIONS = 20000;
/** Look-ahead window for path smoothing; bounds the cost of smoothing long paths. */
const SMOOTHING_WINDOW = 40;
const NEIGHBOR_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NEIGHBOR_DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Ground navigation: static terrain passability plus dynamic structure occupancy, A* with octile heuristic
 * and line-of-sight path smoothing. Buffers are allocated once and reused, so pathing does not allocate
 * per request beyond the returned path.
 */
export class NavGrid {
  readonly width: number;
  readonly height: number;
  private readonly occupancy: Uint16Array;
  private readonly gScore: Float64Array;
  private readonly fScore: Float64Array;
  private readonly cameFrom: Int32Array;
  private readonly visitStamp: Uint32Array;
  private readonly closedStamp: Uint32Array;
  private readonly heap: Int32Array;
  private stamp = 0;
  /** Nodes expanded by the most recent findPath call (for deterministic per-tick budgets). */
  lastExpansions = 0;

  constructor(readonly terrain: Terrain) {
    this.width = terrain.navWidth;
    this.height = terrain.navHeight;
    const size = this.width * this.height;
    this.occupancy = new Uint16Array(size);
    this.gScore = new Float64Array(size);
    this.fScore = new Float64Array(size);
    this.cameFrom = new Int32Array(size);
    this.visitStamp = new Uint32Array(size);
    this.closedStamp = new Uint32Array(size);
    this.heap = new Int32Array(size);
  }

  toCell(world: number): number {
    return Math.floor(world / NAV_CELL_SIZE);
  }

  cellCenter(cell: number): number {
    return (cell + 0.5) * NAV_CELL_SIZE;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  isWalkable(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) {
      return false;
    }
    const index = cy * this.width + cx;
    return this.terrain.blocked[index] === 0 && this.occupancy[index] === 0;
  }

  isWalkableWorld(x: number, y: number): boolean {
    return this.isWalkable(this.toCell(x), this.toCell(y));
  }

  isOccupied(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && (this.occupancy[cy * this.width + cx] ?? 0) > 0;
  }

  occupy(cells: number[]): void {
    for (const cell of cells) {
      this.occupancy[cell] = (this.occupancy[cell] ?? 0) + 1;
    }
  }

  release(cells: number[]): void {
    for (const cell of cells) {
      this.occupancy[cell] = Math.max(0, (this.occupancy[cell] ?? 0) - 1);
    }
  }

  /** Nearest walkable cell centre to a world point (spiral search), or null if none within the radius. */
  nearestWalkable(x: number, y: number, maxRadiusCells = 24): { x: number; y: number } | null {
    const cx = this.toCell(x);
    const cy = this.toCell(y);
    if (this.isWalkable(cx, cy)) {
      return { x, y };
    }
    for (let r = 1; r <= maxRadiusCells; r++) {
      let best: { x: number; y: number } | null = null;
      let bestDistance = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.isWalkable(cx + dx, cy + dy)) {
            continue;
          }
          const wx = this.cellCenter(cx + dx);
          const wy = this.cellCenter(cy + dy);
          const d = (wx - x) ** 2 + (wy - y) ** 2;
          if (d < bestDistance) {
            bestDistance = d;
            best = { x: wx, y: wy };
          }
        }
      }
      if (best) {
        return best;
      }
    }
    return null;
  }

  /** True if a straight line between two world points crosses only walkable cells. */
  hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(length / (NAV_CELL_SIZE * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isWalkableWorld(ax + dx * t, ay + dy * t)) {
        return false;
      }
    }
    return true;
  }

  /**
   * A* from start to goal (world coordinates). Returns a smoothed path as a flat [x0, y0, x1, y1, ...] list
   * ending at the (possibly adjusted) goal, or an empty list when unreachable. If the goal is blocked, the
   * nearest walkable cell is used; if the search budget runs out, the path leads to the closest node found.
   */
  findPath(sx: number, sy: number, gx: number, gy: number): number[] {
    const start = this.nearestWalkable(sx, sy, 6);
    const goal = this.nearestWalkable(gx, gy);
    if (!start || !goal) {
      return [];
    }
    this.lastExpansions = 1;
    if (this.hasLineOfSight(sx, sy, goal.x, goal.y)) {
      return [goal.x, goal.y];
    }

    const width = this.width;
    const startIndex = this.toCell(start.y) * width + this.toCell(start.x);
    const goalCx = this.toCell(goal.x);
    const goalCy = this.toCell(goal.y);
    const goalIndex = goalCy * width + goalCx;

    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.visitStamp.fill(0);
      this.closedStamp.fill(0);
      this.stamp = 1;
    }
    let heapSize = 0;
    const push = (index: number): void => {
      let i = heapSize++;
      this.heap[i] = index;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        const pi = this.heap[parent]!;
        if (this.fScore[pi]! <= this.fScore[index]!) {
          break;
        }
        this.heap[i] = pi;
        this.heap[parent] = index;
        i = parent;
      }
    };
    const pop = (): number => {
      const top = this.heap[0]!;
      const last = this.heap[--heapSize]!;
      let i = 0;
      this.heap[0] = last;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heapSize && this.fScore[this.heap[left]!]! < this.fScore[this.heap[smallest]!]!) {
          smallest = left;
        }
        if (right < heapSize && this.fScore[this.heap[right]!]! < this.fScore[this.heap[smallest]!]!) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        const tmp = this.heap[i]!;
        this.heap[i] = this.heap[smallest]!;
        this.heap[smallest] = tmp;
        i = smallest;
      }
      return top;
    };
    const heuristic = (index: number): number => {
      const dx = Math.abs((index % width) - goalCx);
      const dy = Math.abs(Math.floor(index / width) - goalCy);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };

    this.gScore[startIndex] = 0;
    this.fScore[startIndex] = heuristic(startIndex);
    this.cameFrom[startIndex] = -1;
    this.visitStamp[startIndex] = this.stamp;
    push(startIndex);

    let closest = startIndex;
    let closestH = heuristic(startIndex);
    let expansions = 0;
    let found = false;

    while (heapSize > 0 && expansions < MAX_EXPANSIONS) {
      const current = pop();
      if (this.closedStamp[current] === this.stamp) {
        continue;
      }
      this.closedStamp[current] = this.stamp;
      expansions++;
      if (current === goalIndex) {
        found = true;
        break;
      }
      const h = heuristic(current);
      if (h < closestH) {
        closestH = h;
        closest = current;
      }
      const cx = current % width;
      const cy = Math.floor(current / width);
      for (let n = 0; n < 8; n++) {
        const dx = NEIGHBOR_DX[n]!;
        const dy = NEIGHBOR_DY[n]!;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isWalkable(nx, ny)) {
          continue;
        }
        // No corner cutting: both orthogonal neighbours must be free for a diagonal step.
        if (dx !== 0 && dy !== 0 && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) {
          continue;
        }
        const neighbor = ny * width + nx;
        if (this.closedStamp[neighbor] === this.stamp) {
          continue;
        }
        const tentative = this.gScore[current]! + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (this.visitStamp[neighbor] !== this.stamp || tentative < this.gScore[neighbor]!) {
          this.visitStamp[neighbor] = this.stamp;
          this.gScore[neighbor] = tentative;
          this.fScore[neighbor] = tentative + heuristic(neighbor) * 1.001;
          this.cameFrom[neighbor] = current;
          push(neighbor);
        }
      }
    }

    this.lastExpansions = expansions;
    const end = found ? goalIndex : closest;
    const cells: number[] = [];
    for (let at = end; at !== -1; at = this.cameFrom[at]!) {
      cells.push(at);
      if (at === startIndex) {
        break;
      }
    }
    cells.reverse();

    const raw: number[] = [];
    for (const cell of cells) {
      raw.push(this.cellCenter(cell % width), this.cellCenter(Math.floor(cell / width)));
    }
    if (found) {
      raw[raw.length - 2] = goal.x;
      raw[raw.length - 1] = goal.y;
    }
    return this.smooth(sx, sy, raw);
  }

  /** Removes intermediate waypoints that are directly visible from the previous kept point. */
  private smooth(sx: number, sy: number, raw: number[]): number[] {
    const result: number[] = [];
    let ax = sx;
    let ay = sy;
    let i = 0;
    const count = raw.length / 2;
    while (i < count) {
      let furthest = i;
      for (let j = Math.min(count - 1, i + SMOOTHING_WINDOW); j > i; j--) {
        if (this.hasLineOfSight(ax, ay, raw[j * 2]!, raw[j * 2 + 1]!)) {
          furthest = j;
          break;
        }
      }
      ax = raw[furthest * 2]!;
      ay = raw[furthest * 2 + 1]!;
      result.push(ax, ay);
      i = furthest + 1;
    }
    return result;
  }
}
