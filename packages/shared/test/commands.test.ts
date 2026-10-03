import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/index';

describe('command parsing (untrusted input)', () => {
  it('accepts well-formed commands', () => {
    expect(parseCommand({ type: 'move', units: [3, 1, 3], x: 10, y: 20 })).toEqual({
      type: 'move',
      units: [1, 3],
      x: 10,
      y: 20,
      queue: false,
      formation: 'auto',
    });
    expect(parseCommand({ type: 'produce', building: 5, unit: 'halcyon_mbt', count: 2 })).toMatchObject({ count: 2 });
    expect(parseCommand({ type: 'surrender' })).toEqual({ type: 'surrender' });
  });

  it.each([
    null,
    42,
    'move',
    { type: 'teleport', units: [1] },
    { type: 'move', units: [], x: 1, y: 1 },
    { type: 'move', units: [1.5], x: 1, y: 1 },
    { type: 'move', units: [-1], x: 1, y: 1 },
    { type: 'move', units: [1], x: Number.NaN, y: 1 },
    { type: 'move', units: [1], x: 1e9, y: 1 },
    { type: 'move', units: [1], x: 1, y: 1, formation: 'blob' },
    { type: 'move', units: new Array(500).fill(1).map((_, i) => i + 1), x: 1, y: 1 },
    { type: 'produce', building: 1, unit: 'X; drop table', count: 1 },
    { type: 'produce', building: 1, unit: 'halcyon_mbt', count: 99 },
    { type: 'cancel', building: 1, index: -1 },
    { type: 'attack', units: [1], target: '7' },
  ])('rejects malformed input %#', (raw) => {
    expect(parseCommand(raw)).toBeNull();
  });
});
