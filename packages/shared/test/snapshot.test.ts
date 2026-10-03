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

describe('event codec', () => {
  it('round-trips every event type compactly', async () => {
    const { encodeEvents, decodeEvents, getGameData } = await import('../src/index');
    const data = getGameData();
    const events = [
      { type: 'fire', shooter: 12, weapon: 'halcyon_120mm_smoothbore', x: 10.5, y: 20.2, tx: 30.1, ty: 40.9, target: 77, flight: 4, hit: true },
      { type: 'impact', weapon: 'halcyon_155mm_howitzer', x: 1.2, y: 3.4 },
      { type: 'death', id: 5, defId: 'halcyon_mbt', owner: 1, x: 99.9, y: 100.1, kind: 'unit' },
      { type: 'built', id: 6, owner: 0, defId: 'halcyon_barracks' },
      { type: 'produced', id: 7, owner: 0, defId: 'halcyon_engineer' },
      { type: 'promoted', id: 8, owner: 0, level: 2 },
      { type: 'notice', player: 0, code: 'lowPower' },
      { type: 'notice', player: 1, code: 'underAttack', x: 5, y: 6 },
      { type: 'defeated', player: 1 },
      { type: 'gameOver', winnerTeam: 0 },
    ] as const;
    const encoded = encodeEvents(data, events as never);
    expect(decodeEvents(data, JSON.parse(JSON.stringify(encoded)))).toEqual(events);
    expect(JSON.stringify(encoded[0]).length).toBeLessThan(60);
    expect(decodeEvents(data, [null, 'x', ['zz'], ['n', 0, 99]])).toEqual([]);
  });
});
