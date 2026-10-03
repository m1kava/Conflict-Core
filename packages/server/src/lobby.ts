import { randomBytes, randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  getMap,
  setupBattleScenario,
  type BotDifficulty,
  type ClientMessage,
  type RoomSlotView,
} from '@conflict/shared';
import { log } from './log';
import { Match, type MatchSeat } from './match';
import { Session, type Peer } from './session';

const SESSION_EXPIRY_MS = 15 * 60_000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_MAP = 'ashfall_crossing';

interface RoomSlot {
  session?: Session;
  bot?: BotDifficulty;
  ready: boolean;
}

interface Room {
  code: string;
  host: Session;
  mapId: string;
  slots: RoomSlot[];
}

export interface LobbyOptions {
  version: string;
  maxMatches: number;
  devTools?: boolean;
}

/**
 * Connection-facing game coordinator: identities (sessions), quick-match queue, private rooms, bot games and
 * the set of running matches. All persistent-looking state here is in memory by design — a match server is
 * disposable; accounts, history and rankings belong to a separate backend once one exists.
 */
export class Lobby {
  private readonly sessionsByToken = new Map<string, Session>();
  private readonly queue: Session[] = [];
  private readonly rooms = new Map<string, Room>();
  readonly matches = new Set<Match>();

  constructor(private readonly options: LobbyOptions) {}

  get sessionCount(): number {
    return this.sessionsByToken.size;
  }

  /** Handles the first message on a socket; returns the session or null if the client must be rejected. */
  hello(peer: Peer, message: ClientMessage): Session | null {
    if (message.t !== 'hello') {
      peer.close(4000, 'Expected hello');
      return null;
    }
    if (message.protocol !== PROTOCOL_VERSION) {
      peer.sendJson({ t: 'error', code: 'versionMismatch', message: 'A new version of the game is available. Please reload the page.' });
      peer.close(4001, 'Version mismatch');
      return null;
    }
    const existing = message.token ? this.sessionsByToken.get(message.token) : undefined;
    if (existing) {
      existing.peer?.close(4002, 'Replaced by a new connection');
      existing.peer = peer;
      existing.name = message.name;
      existing.disconnectedAt = 0;
      peer.sendJson({ t: 'welcome', clientId: existing.id, token: existing.token, serverVersion: this.options.version, name: existing.name });
      if (existing.match) {
        existing.match.reconnect(existing);
      } else if (existing.roomCode) {
        this.broadcastRoom(existing.roomCode);
      }
      return existing;
    }
    const session = new Session(randomUUID(), randomBytes(24).toString('base64url'), message.name, peer);
    this.sessionsByToken.set(session.token, session);
    peer.sendJson({ t: 'welcome', clientId: session.id, token: session.token, serverVersion: this.options.version, name: session.name });
    return session;
  }

  handle(session: Session, message: ClientMessage): void {
    switch (message.t) {
      case 'hello':
        return;
      case 'quickMatch':
        return this.joinQueue(session);
      case 'cancelQueue':
        return this.leaveQueue(session);
      case 'playBot':
        return this.startBotMatch(session, message.difficulty);
      case 'createRoom':
        return this.createRoom(session);
      case 'joinRoom':
        return this.joinRoom(session, message.code);
      case 'leaveRoom':
        return this.leaveRoom(session);
      case 'setReady':
        return this.setReady(session, message.ready);
      case 'setBot':
        return this.setBot(session, message.slot, message.difficulty);
      case 'startRoom':
        return this.startRoom(session);
      case 'command':
        if (!session.match) {
          session.send({ t: 'error', code: 'notInMatch', message: 'You are not in a match.' });
          return;
        }
        session.match.handleCommand(session, message.seq, message.command);
        return;
      case 'leaveMatch':
        session.match?.leave(session);
        return;
      case 'ping':
        session.send({ t: 'pong', time: message.time, serverTick: session.match?.world.tick ?? 0 });
        return;
      case 'devBattle':
        if (!this.options.devTools) {
          session.send({ t: 'error', code: 'badMessage', message: 'Development tools are disabled on this server.' });
          return;
        }
        this.createMatch(
          [
            { slot: 0, team: 0, name: session.name, session },
            { slot: 1, team: 1, name: 'Normal AI', bot: 'normal' },
          ],
          message.units,
        );
        return;
    }
  }

  disconnected(session: Session, peer: Peer): void {
    if (session.peer !== peer) {
      return; // an older socket closing after a reconnect replaced it
    }
    session.peer = null;
    session.disconnectedAt = Date.now();
    this.leaveQueue(session);
    session.match?.disconnect(session);
  }

  /** Periodic housekeeping: forget sessions that have been gone for a long time. */
  sweep(now = Date.now()): void {
    for (const [token, session] of this.sessionsByToken) {
      if (!session.connected && now - session.disconnectedAt > SESSION_EXPIRY_MS) {
        if (session.roomCode) {
          this.leaveRoom(session);
        }
        session.match?.leave(session);
        this.sessionsByToken.delete(token);
      }
    }
  }

  // ------------------------------------------------------------ quick match

  private joinQueue(session: Session): void {
    if (session.match || session.inQueue) {
      return;
    }
    if (session.roomCode) {
      this.leaveRoom(session);
    }
    session.inQueue = true;
    this.queue.push(session);
    this.notifyQueue();
    while (this.queue.length >= 2 && this.canStartMatch()) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      a.inQueue = false;
      b.inQueue = false;
      this.createMatch([
        { slot: 0, team: 0, name: a.name, session: a },
        { slot: 1, team: 1, name: b.name, session: b },
      ]);
    }
    this.notifyQueue();
  }

  private leaveQueue(session: Session): void {
    const index = this.queue.indexOf(session);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
    if (session.inQueue) {
      session.inQueue = false;
      session.send({ t: 'queue', searching: false, waitingPlayers: this.queue.length });
    }
  }

  private notifyQueue(): void {
    for (const session of this.queue) {
      session.send({ t: 'queue', searching: true, waitingPlayers: this.queue.length });
    }
  }

  // ------------------------------------------------------------ bot match

  private startBotMatch(session: Session, difficulty: BotDifficulty): void {
    if (session.match && !session.match.isEnded) {
      return;
    }
    this.leaveQueue(session);
    if (session.roomCode) {
      this.leaveRoom(session);
    }
    if (!this.canStartMatch()) {
      session.send({ t: 'error', code: 'serverFull', message: 'The server is busy. Please try again shortly.' });
      return;
    }
    this.createMatch([
      { slot: 0, team: 0, name: session.name, session },
      { slot: 1, team: 1, name: `${capitalize(difficulty)} AI`, bot: difficulty },
    ]);
  }

  // ------------------------------------------------------------ rooms

  private createRoom(session: Session): void {
    if (session.match && !session.match.isEnded) {
      return;
    }
    this.leaveQueue(session);
    if (session.roomCode) {
      this.leaveRoom(session);
    }
    const map = getMap(DEFAULT_MAP);
    const room: Room = {
      code: this.newRoomCode(),
      host: session,
      mapId: map.id,
      slots: Array.from({ length: map.maxPlayers }, (_, i) => (i === 0 ? { session, ready: true } : { ready: false })),
    };
    this.rooms.set(room.code, room);
    session.roomCode = room.code;
    log('info', 'room created', { code: room.code });
    this.broadcastRoom(room.code);
  }

  private joinRoom(session: Session, code: string): void {
    const room = this.rooms.get(code);
    if (!room) {
      session.send({ t: 'error', code: 'roomNotFound', message: `No room with code ${code}.` });
      return;
    }
    if (room.slots.some((s) => s.session === session)) {
      this.broadcastRoom(code);
      return;
    }
    const free = room.slots.find((s) => !s.session && !s.bot);
    if (!free) {
      session.send({ t: 'error', code: 'roomFull', message: 'That room is full.' });
      return;
    }
    this.leaveQueue(session);
    if (session.roomCode) {
      this.leaveRoom(session);
    }
    free.session = session;
    free.ready = false;
    session.roomCode = code;
    this.broadcastRoom(code);
  }

  private leaveRoom(session: Session): void {
    const code = session.roomCode;
    const room = code ? this.rooms.get(code) : undefined;
    session.roomCode = null;
    if (!room || !code) {
      return;
    }
    if (room.host === session) {
      this.rooms.delete(code);
      for (const slot of room.slots) {
        if (slot.session && slot.session !== session) {
          slot.session.roomCode = null;
          slot.session.send({ t: 'roomClosed', reason: 'The host left the room.' });
        }
      }
      return;
    }
    const slot = room.slots.find((s) => s.session === session);
    if (slot) {
      delete slot.session;
      slot.ready = false;
    }
    this.broadcastRoom(code);
  }

  private setReady(session: Session, ready: boolean): void {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : undefined;
    const slot = room?.slots.find((s) => s.session === session);
    if (room && slot && room.host !== session) {
      slot.ready = ready;
      this.broadcastRoom(room.code);
    }
  }

  private setBot(session: Session, index: number, difficulty: BotDifficulty | null): void {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : undefined;
    if (!room || room.host !== session) {
      session.send({ t: 'error', code: 'notHost', message: 'Only the host can change slots.' });
      return;
    }
    const slot = room.slots[index];
    if (!slot || slot.session) {
      return;
    }
    if (difficulty) {
      slot.bot = difficulty;
      slot.ready = true;
    } else {
      delete slot.bot;
      slot.ready = false;
    }
    this.broadcastRoom(room.code);
  }

  private startRoom(session: Session): void {
    const room = session.roomCode ? this.rooms.get(session.roomCode) : undefined;
    if (!room || room.host !== session) {
      session.send({ t: 'error', code: 'notHost', message: 'Only the host can start the match.' });
      return;
    }
    if (!this.roomCanStart(room)) {
      session.send({ t: 'error', code: 'notReady', message: 'Every slot needs a ready player or an AI.' });
      return;
    }
    if (!this.canStartMatch()) {
      session.send({ t: 'error', code: 'serverFull', message: 'The server is busy. Please try again shortly.' });
      return;
    }
    this.rooms.delete(room.code);
    const seats: MatchSeat[] = room.slots.map((slot, index) => {
      if (slot.session) {
        slot.session.roomCode = null;
        return { slot: index, team: index, name: slot.session.name, session: slot.session };
      }
      return { slot: index, team: index, name: `${capitalize(slot.bot ?? 'normal')} AI`, bot: slot.bot ?? 'normal' };
    });
    this.createMatch(seats);
  }

  private roomCanStart(room: Room): boolean {
    const everySlotFilled = room.slots.every((s) => (s.session !== undefined && s.ready) || s.bot !== undefined);
    const hasOpponent = room.slots.some((s) => (s.session !== undefined && s.session !== room.host) || s.bot !== undefined);
    return everySlotFilled && hasOpponent;
  }

  private broadcastRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) {
      return;
    }
    for (const viewer of room.slots) {
      if (!viewer.session) {
        continue;
      }
      const slots: RoomSlotView[] = room.slots.map((slot, index) => {
        if (slot.session) {
          return { slot: index, kind: 'human', name: slot.session.name, ready: slot.ready, isHost: slot.session === room.host, isYou: slot.session === viewer.session };
        }
        if (slot.bot) {
          return { slot: index, kind: 'bot', name: `${capitalize(slot.bot)} AI`, ready: true, isHost: false, isYou: false, difficulty: slot.bot };
        }
        return { slot: index, kind: 'open', name: 'Open', ready: false, isHost: false, isYou: false };
      });
      viewer.session.send({ t: 'room', code, mapId: room.mapId, slots, canStart: viewer.session === room.host && this.roomCanStart(room) });
    }
  }

  private newRoomCode(): string {
    for (;;) {
      const bytes = randomBytes(5);
      let code = '';
      for (const byte of bytes) {
        code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
  }

  // ------------------------------------------------------------ matches

  private canStartMatch(): boolean {
    return this.matches.size < this.options.maxMatches;
  }

  private createMatch(seats: MatchSeat[], battleUnits = 0): Match {
    for (const seat of seats) {
      if (seat.session?.match) {
        seat.session.match.leave(seat.session);
      }
    }
    const match = new Match(randomUUID(), seats, (m) => this.matches.delete(m));
    if (battleUnits > 0) {
      setupBattleScenario(match.world, Math.round(battleUnits / 2));
    }
    this.matches.add(match);
    match.start();
    return match;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
