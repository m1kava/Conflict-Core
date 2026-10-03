import type { Command } from '../sim/commands';
import type { BotDifficulty } from '../ai/bot';
import type { PlayerStats } from '../sim/world';

/**
 * Control-plane messages (JSON over WebSocket). High-frequency world state travels as binary snapshots
 * (see snapshot.ts). Every client → server message is parsed by `parseClientMessage`, which rejects anything
 * that is not exactly the expected shape.
 */

export type ClientMessage =
  | { t: 'hello'; protocol: number; name: string; token?: string }
  | { t: 'quickMatch' }
  | { t: 'cancelQueue' }
  | { t: 'playBot'; difficulty: BotDifficulty }
  | { t: 'createRoom' }
  | { t: 'joinRoom'; code: string }
  | { t: 'leaveRoom' }
  | { t: 'setReady'; ready: boolean }
  | { t: 'setBot'; slot: number; difficulty: BotDifficulty | null }
  | { t: 'startRoom' }
  | { t: 'command'; seq: number; command: unknown }
  | { t: 'leaveMatch' }
  | { t: 'ping'; time: number };

export interface RoomSlotView {
  slot: number;
  kind: 'open' | 'human' | 'bot';
  name: string;
  ready: boolean;
  isHost: boolean;
  isYou: boolean;
  difficulty?: BotDifficulty;
}

export interface MatchPlayerView {
  slot: number;
  team: number;
  name: string;
  faction: string;
  isBot: boolean;
}

export interface QueuedItemView {
  unitId: string;
  progress: number;
}

export interface PrivateStateView {
  credits: number;
  powerProduced: number;
  powerUsed: number;
  lowPower: boolean;
  hasRadar: boolean;
  /** Production queues of own buildings, keyed by building id. */
  queues: Record<number, QueuedItemView[]>;
  /** Rally points of own production buildings, keyed by building id. */
  rallies: Record<number, [number, number]>;
  lastCommandSeq: number;
}

export type ServerMessage =
  | { t: 'welcome'; clientId: string; token: string; serverVersion: string; name: string }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'queue'; searching: boolean; waitingPlayers: number }
  | { t: 'room'; code: string; mapId: string; slots: RoomSlotView[]; canStart: boolean }
  | { t: 'roomClosed'; reason: string }
  | {
      t: 'matchStart';
      matchId: string;
      mapId: string;
      slot: number;
      players: MatchPlayerView[];
      tickRate: number;
      tick: number;
      resumed: boolean;
      dataHash: string;
    }
  | { t: 'events'; tick: number; events: unknown[] }
  | { t: 'private'; tick: number; state: PrivateStateView }
  | { t: 'playerStatus'; slot: number; connected: boolean; graceSeconds?: number }
  | { t: 'matchEnd'; winnerTeam: number; youWon: boolean; durationSeconds: number; stats: { slot: number; name: string; stats: PlayerStats }[] }
  | { t: 'pong'; time: number; serverTick: number };

export type ErrorCode =
  | 'versionMismatch'
  | 'badMessage'
  | 'rateLimited'
  | 'roomNotFound'
  | 'roomFull'
  | 'notHost'
  | 'notReady'
  | 'notInMatch'
  | 'serverFull'
  | 'internal';

const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];
export const MAX_NAME_LENGTH = 20;

/** Strict parser for untrusted client JSON. Returns null for anything malformed. */
export function parseClientMessage(text: string): ClientMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const m = raw as Record<string, unknown>;
  switch (m['t']) {
    case 'hello': {
      const name = sanitizeName(m['name']);
      if (typeof m['protocol'] !== 'number' || name === null) {
        return null;
      }
      const token = typeof m['token'] === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(m['token']) ? m['token'] : undefined;
      return token ? { t: 'hello', protocol: m['protocol'], name, token } : { t: 'hello', protocol: m['protocol'], name };
    }
    case 'quickMatch':
    case 'cancelQueue':
    case 'createRoom':
    case 'leaveRoom':
    case 'startRoom':
    case 'leaveMatch':
      return { t: m['t'] };
    case 'playBot':
      return DIFFICULTIES.includes(m['difficulty'] as BotDifficulty) ? { t: 'playBot', difficulty: m['difficulty'] as BotDifficulty } : null;
    case 'joinRoom':
      return typeof m['code'] === 'string' && /^[A-Z0-9]{4,8}$/.test(m['code'].toUpperCase())
        ? { t: 'joinRoom', code: m['code'].toUpperCase() }
        : null;
    case 'setReady':
      return typeof m['ready'] === 'boolean' ? { t: 'setReady', ready: m['ready'] } : null;
    case 'setBot': {
      const slot = m['slot'];
      const difficulty = m['difficulty'];
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot > 7) {
        return null;
      }
      if (difficulty !== null && !DIFFICULTIES.includes(difficulty as BotDifficulty)) {
        return null;
      }
      return { t: 'setBot', slot, difficulty: difficulty as BotDifficulty | null };
    }
    case 'command': {
      const seq = m['seq'];
      if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1 || seq > 2 ** 31) {
        return null;
      }
      return { t: 'command', seq, command: m['command'] as Command };
    }
    case 'ping':
      return typeof m['time'] === 'number' && Number.isFinite(m['time']) ? { t: 'ping', time: m['time'] } : null;
    default:
      return null;
  }
}

/** Trims, strips control characters and markup-significant characters, limits length. */
export function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length >= 1 ? cleaned : null;
}
