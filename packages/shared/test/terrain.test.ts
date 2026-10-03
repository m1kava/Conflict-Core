import { describe, expect, it } from 'vitest';
import { getMap, NavGrid, Terrain } from '../src/index';

describe('terrain and navigation', () => {
  const terrain = new Terrain(getMap('ashfall_crossing'));
  const nav = new NavGrid(terrain);

  it('spawns are walkable plateaus', () => {
    for (const spawn of terrain.map.spawns) {
      expect(nav.isWalkableWorld(spawn.x, spawn.y)).toBe(true);
      expect(terrain.heightAt(spawn.x, spawn.y)).toBeGreaterThan(4);
    }
  });

  it('river is impassable except at crossings', () => {
    expect(terrain.isDeepWater(120, 200)).toBe(true);
    expect(nav.isWalkableWorld(120, 200)).toBe(false);
    for (const crossing of terrain.map.river!.crossings) {
      expect(nav.isWalkableWorld(crossing.x, crossing.y)).toBe(true);
    }
  });

  it('finds a path between the two bases across the river', () => {
    const [a, b] = terrain.map.spawns;
    const path = nav.findPath(a!.x + 20, a!.y + 20, b!.x - 20, b!.y - 20);
    expect(path.length).toBeGreaterThanOrEqual(4);
    const endX = path[path.length - 2]!;
    const endY = path[path.length - 1]!;
    expect(Math.hypot(endX - (b!.x - 20), endY - (b!.y - 20))).toBeLessThan(3);
    for (let i = 0; i + 3 < path.length; i += 2) {
      expect(nav.hasLineOfSight(path[i]!, path[i + 1]!, path[i + 2]!, path[i + 3]!)).toBe(true);
    }
  });

  it('routes around structures', () => {
    const cells: number[] = [];
    for (let cy = 70; cy < 90; cy++) {
      cells.push(cy * nav.width + 60);
    }
    nav.occupy(cells);
    expect(nav.isWalkable(60, 80)).toBe(false);
    const path = nav.findPath(110, 160, 130, 160);
    expect(path.length).toBeGreaterThan(2);
    nav.release(cells);
    expect(nav.isWalkable(60, 80)).toBe(true);
  });
});
