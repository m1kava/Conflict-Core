/**
 * Player intents. Clients (and bots) only ever send these; the server validates them against authoritative
 * state before they reach the simulation. Nothing here can assert a result.
 */
export type FormationKind = 'auto' | 'line' | 'wedge' | 'spread';

export type Command =
  | { type: 'move'; units: number[]; x: number; y: number; queue?: boolean; formation?: FormationKind }
  | { type: 'attackMove'; units: number[]; x: number; y: number; queue?: boolean; formation?: FormationKind }
  | { type: 'attack'; units: number[]; target: number; queue?: boolean }
  | { type: 'stop'; units: number[] }
  | { type: 'hold'; units: number[] }
  | { type: 'guard'; units: number[] }
  | { type: 'build'; units: number[]; building: string; x: number; y: number; rotated?: boolean }
  | { type: 'repair'; units: number[]; target: number }
  | { type: 'harvest'; units: number[]; target: number }
  | { type: 'produce'; building: number; unit: string; count?: number }
  | { type: 'cancel'; building: number; index: number }
  | { type: 'rally'; building: number; x: number; y: number }
  | { type: 'sell'; building: number }
  | { type: 'surrender' };

export type CommandType = Command['type'];

export const MAX_COMMAND_UNITS = 200;
const MAX_PRODUCE_COUNT = 5;
const FORMATIONS: readonly FormationKind[] = ['auto', 'line', 'wedge', 'spread'];

/**
 * Structural validation of untrusted JSON. Returns a well-typed command or null; never throws.
 * Semantic checks (ownership, costs, visibility) happen in the world when the command is applied.
 */
export function parseCommand(raw: unknown): Command | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  switch (r['type']) {
    case 'move':
    case 'attackMove': {
      const units = parseIds(r['units']);
      const x = parseNumber(r['x']);
      const y = parseNumber(r['y']);
      const formation = r['formation'] === undefined ? 'auto' : r['formation'];
      if (!units || x === null || y === null || !FORMATIONS.includes(formation as FormationKind)) {
        return null;
      }
      return { type: r['type'], units, x, y, queue: r['queue'] === true, formation: formation as FormationKind };
    }
    case 'attack': {
      const units = parseIds(r['units']);
      const target = parseId(r['target']);
      return units && target !== null ? { type: 'attack', units, target, queue: r['queue'] === true } : null;
    }
    case 'stop':
    case 'hold':
    case 'guard': {
      const units = parseIds(r['units']);
      return units ? { type: r['type'], units } : null;
    }
    case 'build': {
      const units = parseIds(r['units']);
      const x = parseNumber(r['x']);
      const y = parseNumber(r['y']);
      const building = parseDefId(r['building']);
      if (!units || x === null || y === null || building === null) {
        return null;
      }
      return { type: 'build', units, building, x, y, rotated: r['rotated'] === true };
    }
    case 'repair':
    case 'harvest': {
      const units = parseIds(r['units']);
      const target = parseId(r['target']);
      return units && target !== null ? { type: r['type'], units, target } : null;
    }
    case 'produce': {
      const building = parseId(r['building']);
      const unit = parseDefId(r['unit']);
      const count = r['count'] === undefined ? 1 : parseNumber(r['count']);
      if (building === null || unit === null || count === null || !Number.isInteger(count) || count < 1 || count > MAX_PRODUCE_COUNT) {
        return null;
      }
      return { type: 'produce', building, unit, count };
    }
    case 'cancel': {
      const building = parseId(r['building']);
      const index = parseNumber(r['index']);
      return building !== null && index !== null && Number.isInteger(index) && index >= 0 && index < 16
        ? { type: 'cancel', building, index }
        : null;
    }
    case 'rally': {
      const building = parseId(r['building']);
      const x = parseNumber(r['x']);
      const y = parseNumber(r['y']);
      return building !== null && x !== null && y !== null ? { type: 'rally', building, x, y } : null;
    }
    case 'sell': {
      const building = parseId(r['building']);
      return building !== null ? { type: 'sell', building } : null;
    }
    case 'surrender':
      return { type: 'surrender' };
    default:
      return null;
  }
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e6 ? value : null;
}

function parseId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 2 ** 31 ? value : null;
}

function parseDefId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null;
}

function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_COMMAND_UNITS) {
    return null;
  }
  const ids = new Set<number>();
  for (const item of value) {
    const id = parseId(item);
    if (id === null) {
      return null;
    }
    ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}
