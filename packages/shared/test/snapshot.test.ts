import { describe, expect, it } from 'vitest';
import { setupBattleScenario, SnapshotDecoder, SnapshotEncoder, TICK_RATE } from '../src/index';
import { createWorld, owned } from './helpers';

describe('snapshot delta encoding', () => {
  it('round-trips visible entities exactly (within quantisation) across many ticks', () => {
    const world = createWorld(3);
    setupBattleScenario(world, 30);
    const encoder = new SnapshotEncoder();
    const decoder = new SnapshotDecoder();
    const mirror = new Map<number, { x: number; y: number; health: number }>();
    for (let tick = 0; tick < TICK_RATE * 20; tick++) {
      world.step();
      const snapshot = decoder.decode(encoder.encode(world, 0));
      for (const view of snapshot.upserts) {
        mirror.set(view.id, { x: view.x, y: view.y, health: view.health });
      }
      for (const id of snapshot.removes) {
        mirror.delete(id);
      }
    }
    const visible = [...world.entities.values()].filter((e) => world.isVisibleToTeam(0, e));
    expect(mirror.size).toBe(visible.length);
    for (const entity of visible) {
      const seen = mirror.get(entity.id)!;
      expect(Math.abs(seen.x - entity.x)).toBeLessThan(1 / 64);
      expect(Math.abs(seen.y - entity.y)).toBeLessThan(1 / 64);
    }
  });

  it('sends nothing for unchanged entities', () => {
    const world = createWorld(4);
    const encoder = new SnapshotEncoder();
    world.step();
    const first = encoder.encode(world, 0);
    world.step();
    const second = encoder.encode(world, 0);
    expect(first.byteLength).toBeGreaterThan(40);
    expect(second.byteLength).toBeLessThanOrEqual(12);
  });

  it('never includes hidden enemies', () => {
    const world = createWorld(5);
    const enemyHq = owned(world, 1, 'halcyon_hq')[0]!;
    const decoder = new SnapshotDecoder();
    world.step();
    const snapshot = decoder.decode(new SnapshotEncoder().encode(world, 0));
    expect(snapshot.upserts.some((u) => u.id === enemyHq.id)).toBe(false);
  });

  it('rejects truncated data', () => {
    const world = createWorld(6);
    world.step();
    const bytes = new SnapshotEncoder().encode(world, 0);
    expect(() => new SnapshotDecoder().decode(bytes.subarray(0, bytes.length - 3))).toThrow();
  });
});
