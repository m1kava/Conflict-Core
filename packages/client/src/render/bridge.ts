import { distanceToSegment, type Terrain } from '@conflict/shared';

export interface BridgeInfo {
  x: number;
  y: number;
  /** Direction of the span (radians, sim space). */
  direction: number;
  length: number;
  width: number;
  deck: number;
}

const cache = new WeakMap<Terrain, BridgeInfo | null>();

/** Geometry of the map's bridge (if any), shared by the bridge mesh and ground-height queries. */
export function bridgeInfo(terrain: Terrain): BridgeInfo | null {
  if (cache.has(terrain)) {
    return cache.get(terrain) ?? null;
  }
  const river = terrain.map.river;
  const crossing = river?.crossings.find((c) => c.bridge);
  let info: BridgeInfo | null = null;
  if (river && crossing) {
    let best = Infinity;
    let direction = 0;
    for (let i = 0; i + 1 < river.points.length; i++) {
      const a = river.points[i]!;
      const b = river.points[i + 1]!;
      const d = distanceToSegment(crossing.x, crossing.y, a.x, a.y, b.x, b.y);
      if (d < best) {
        best = d;
        direction = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      }
    }
    const half = river.width * 0.5 + 9;
    const ax = crossing.x - Math.cos(direction) * half;
    const ay = crossing.y - Math.sin(direction) * half;
    const bx = crossing.x + Math.cos(direction) * half;
    const by = crossing.y + Math.sin(direction) * half;
    info = {
      x: crossing.x,
      y: crossing.y,
      direction,
      length: half * 2,
      width: crossing.radius * 2 + 1,
      deck: Math.max(terrain.heightAt(ax, ay), terrain.heightAt(bx, by), terrain.map.waterLevel + 2) + 0.15,
    };
  }
  cache.set(terrain, info);
  return info;
}

/** Ground height including the bridge deck where applicable. */
export function groundHeight(terrain: Terrain, x: number, y: number): number {
  const h = terrain.heightAt(x, y);
  const bridge = bridgeInfo(terrain);
  if (!bridge) {
    return h;
  }
  const dx = x - bridge.x;
  const dy = y - bridge.y;
  const along = dx * Math.cos(bridge.direction) + dy * Math.sin(bridge.direction);
  const across = -dx * Math.sin(bridge.direction) + dy * Math.cos(bridge.direction);
  if (Math.abs(along) <= bridge.length / 2 && Math.abs(across) <= bridge.width / 2) {
    return Math.max(h, bridge.deck);
  }
  return h;
}
