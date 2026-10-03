import { FOG_CELL_SIZE } from '../constants';
import type { World } from './world';

const stampCache = new Map<number, Int16Array>();

/** Cell offsets (dx, dy pairs) covering a circle of the given radius in fog cells. Cached per radius. */
function circleOffsets(radiusCells: number): Int16Array {
  let cached = stampCache.get(radiusCells);
  if (!cached) {
    const offsets: number[] = [];
    const limit = (radiusCells + 0.5) * (radiusCells + 0.5);
    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        if (dx * dx + dy * dy <= limit) {
          offsets.push(dx, dy);
        }
      }
    }
    cached = Int16Array.from(offsets);
    stampCache.set(radiusCells, cached);
  }
  return cached;
}

/**
 * Rebuilds each team's visible-cell grid from its units' and structures' vision radii. The server uses it to
 * decide which enemy entities and events each player may receive — fog of war is enforced by never sending
 * hidden information, not by hiding it on the client.
 */
export function updateVisibility(world: World): void {
  for (const grid of world.visibility.values()) {
    grid.fill(0);
  }
  const width = world.fogWidth;
  const height = world.fogHeight;
  for (const entity of world.entities.values()) {
    if (!entity.alive || entity.owner < 0 || entity.visionRadius <= 0) {
      continue;
    }
    const grid = world.visibility.get(entity.team);
    if (!grid) {
      continue;
    }
    const radius = entity.kind === 'building' && !entity.complete ? Math.min(entity.visionRadius, 16) : entity.visionRadius;
    const offsets = circleOffsets(Math.round(radius / FOG_CELL_SIZE));
    const cx = Math.floor(entity.x / FOG_CELL_SIZE);
    const cy = Math.floor(entity.y / FOG_CELL_SIZE);
    for (let i = 0; i < offsets.length; i += 2) {
      const x = cx + offsets[i]!;
      const y = cy + offsets[i + 1]!;
      if (x >= 0 && y >= 0 && x < width && y < height) {
        grid[y * width + x] = 1;
      }
    }
  }
}
