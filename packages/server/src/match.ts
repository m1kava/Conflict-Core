import {
  Bot,
  encodeEvents,
  eventsForPlayer,
  getGameData,
  getMap,
  parseCommand,
  RECONNECT_GRACE_SECONDS,
  SnapshotEncoder,
  TICK_RATE,
  World,
  type BotDifficulty,
  type MatchPlayerView,
  type PrivateStateView,
} from '@conflict/shared';
import { log } from './log';
import { RateLimiter } from './rateLimiter';
import type { Session } from './session';

export interface MatchSeat {
  slot: number;
  team: number;
  name: string;
  session?: Session;
  bot?: BotDifficulty;
}

interface HumanSeat {
  slot: number;
  session: Session;
  encoder: SnapshotEncoder;
  limiter: RateLimiter;
  lastSeq: number;
  droppedCommands: number;
  connected: boolean;
  disconnectedAt: number;
}

const COMMAND_BURST = 40;
const COMMANDS_PER_SECOND = 20;
const PRIVATE_STATE_INTERVAL = 3;
const LINGER_AFTER_END_MS = 60_000;
const MAX_TICK_CATCH_UP = 5;

/**
 * One authoritative match: owns the World, runs it at a fixed tick rate, accepts validated commands and
 * streams fog-filtered snapshots, events and private state to each human. Disposable: all state lives here
 * and disappears with the match.
 */
export class Match {
  readonly world: World;
  readonly players: MatchPlayerView[];
  private readonly humans = new Map<number, HumanSeat>();
  private readonly bots: Bot[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextTickAt = 0;
  private ended = false;
  private endedAt = 0;

  constructor(
    readonly id: string,
    seats: MatchSeat[],
    private readonly onDisposed: (match: Match) => void,
    readonly mapId = 'ashfall_crossing',
    seed = Math.floor(Math.random() * 2 ** 31),
    private readonly now: () => number = () => performance.now(),
  ) {
    const data = getGameData();
    this.world = new World({
      map: getMap(mapId),
      data,
      players: seats.map((s) => ({ slot: s.slot, team: s.team, faction: 'halcyon', name: s.name })),
      seed,
    });
    this.players = seats.map((s) => ({ slot: s.slot, team: s.team, name: s.name, faction: 'halcyon', isBot: s.bot !== undefined }));
    for (const seat of seats) {
      if (seat.bot) {
        this.bots.push(new Bot(this.world, seat.slot, seat.bot));
      } else if (seat.session) {
        this.humans.set(seat.slot, {
          slot: seat.slot,
          session: seat.session,
          encoder: new SnapshotEncoder(),
          limiter: new RateLimiter(COMMAND_BURST, COMMANDS_PER_SECOND, this.now()),
          lastSeq: 0,
          droppedCommands: 0,
          connected: seat.session.connected,
          disconnectedAt: 0,
        });
        seat.session.match = this;
      }
    }
    log('info', 'match created', { matchId: id, players: this.players.map((p) => p.name), seed });
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get humanCount(): number {
    return this.humans.size;
  }

  start(): void {
    for (const seat of this.humans.values()) {
      this.sendStart(seat, false);
    }
    this.nextTickAt = this.now();
    this.schedule();
  }

  /** Advances the simulation by one tick (public for tests; the timer calls it in production). */
  tick(): void {
    if (this.ended) {
      return;
    }
    for (const bot of this.bots) {
      bot.update();
    }
    const events = this.world.step();
    this.checkConnections();
    for (const seat of this.humans.values()) {
      if (!seat.connected) {
        continue;
      }
      const player = this.world.player(seat.slot)!;
      seat.session.sendBinary(seat.encoder.encode(this.world, player.team));
      const visible = eventsForPlayer(this.world, seat.slot, events);
      if (visible.length > 0) {
        seat.session.send({ t: 'events', tick: this.world.tick, events: encodeEvents(this.world.data, visible) });
      }
      if (this.world.tick % PRIVATE_STATE_INTERVAL === 0) {
        this.sendPrivate(seat);
      }
    }
    if (this.world.ended) {
      this.finish();
    }
  }

  handleCommand(session: Session, seq: number, raw: unknown): void {
    const seat = this.seatOf(session);
    if (!seat || this.ended) {
      return;
    }
    if (seq <= seat.lastSeq) {
      return; // duplicate (resent after reconnect) — already applied
    }
    if (!seat.limiter.tryTake(this.now())) {
      seat.droppedCommands++;
      if (seat.droppedCommands % 20 === 1) {
        session.send({ t: 'error', code: 'rateLimited', message: 'Too many commands; some were ignored.' });
      }
      return;
    }
    seat.lastSeq = seq;
    const command = parseCommand(raw);
    if (!command) {
      log('warn', 'malformed command', { matchId: this.id, slot: seat.slot });
      return;
    }
    this.world.issue(seat.slot, command);
  }

  /** Re-attaches a reconnected session: full snapshot from scratch, then normal deltas. */
  reconnect(session: Session): void {
    const seat = this.seatOf(session);
    if (!seat) {
      return;
    }
    seat.connected = true;
    seat.encoder.reset();
    this.sendStart(seat, true);
    this.sendPrivate(seat);
    this.broadcast({ t: 'playerStatus', slot: seat.slot, connected: true });
    log('info', 'player reconnected', { matchId: this.id, slot: seat.slot });
    if (this.ended) {
      this.sendEnd(seat);
    }
  }

  disconnect(session: Session): void {
    const seat = this.seatOf(session);
    if (!seat || !seat.connected) {
      return;
    }
    seat.connected = false;
    seat.disconnectedAt = this.now();
    this.broadcast({ t: 'playerStatus', slot: seat.slot, connected: false, graceSeconds: RECONNECT_GRACE_SECONDS });
    log('info', 'player disconnected', { matchId: this.id, slot: seat.slot });
  }

  /** Player chose to leave: counts as surrender if the match is still running. */
  leave(session: Session): void {
    const seat = this.seatOf(session);
    if (!seat) {
      return;
    }
    if (!this.ended) {
      this.world.issue(seat.slot, { type: 'surrender' });
    }
    this.humans.delete(seat.slot);
    session.match = null;
    if (this.humans.size === 0) {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const seat of this.humans.values()) {
      if (seat.session.match === this) {
        seat.session.match = null;
      }
    }
    this.humans.clear();
    this.ended = true;
    this.onDisposed(this);
  }

  private schedule(): void {
    const delay = Math.max(0, this.nextTickAt - this.now());
    this.timer = setTimeout(() => this.runDueTicks(), delay);
  }

  /** Fixed-rate loop with bounded catch-up after event-loop stalls. */
  private runDueTicks(): void {
    const interval = 1000 / TICK_RATE;
    let ran = 0;
    try {
      while (this.now() >= this.nextTickAt && ran < MAX_TICK_CATCH_UP && !this.ended) {
        this.tick();
        this.nextTickAt += interval;
        ran++;
      }
    } catch (error) {
      log('error', 'match tick failed', { matchId: this.id, error: String((error as Error).stack ?? error) });
      this.dispose();
      return;
    }
    if (this.now() - this.nextTickAt > interval * MAX_TICK_CATCH_UP) {
      this.nextTickAt = this.now();
    }
    if (this.ended) {
      if (this.endedAt && this.now() - this.endedAt > LINGER_AFTER_END_MS) {
        this.dispose();
        return;
      }
      this.timer = setTimeout(() => this.runDueTicks(), 1000);
      return;
    }
    this.schedule();
  }

  private checkConnections(): void {
    if (this.world.tick % TICK_RATE !== 0) {
      return;
    }
    const now = this.now();
    let anyConnected = false;
    for (const seat of this.humans.values()) {
      if (seat.connected) {
        anyConnected = true;
      } else if (now - seat.disconnectedAt > RECONNECT_GRACE_SECONDS * 1000 && !this.world.player(seat.slot)?.defeated) {
        log('info', 'player abandoned', { matchId: this.id, slot: seat.slot });
        this.world.issue(seat.slot, { type: 'surrender' });
      }
    }
    if (!anyConnected && [...this.humans.values()].every((s) => now - s.disconnectedAt > RECONNECT_GRACE_SECONDS * 1000)) {
      log('info', 'match abandoned by all players', { matchId: this.id });
      this.dispose();
    }
  }

  private finish(): void {
    this.ended = true;
    this.endedAt = this.now();
    for (const seat of this.humans.values()) {
      if (seat.connected) {
        this.sendPrivate(seat);
        this.sendEnd(seat);
      }
    }
    log('info', 'match ended', { matchId: this.id, winnerTeam: this.world.winnerTeam, minutes: (this.world.seconds / 60).toFixed(1) });
  }

  private sendStart(seat: HumanSeat, resumed: boolean): void {
    seat.session.send({
      t: 'matchStart',
      matchId: this.id,
      mapId: this.mapId,
      slot: seat.slot,
      players: this.players,
      tickRate: TICK_RATE,
      tick: this.world.tick,
      resumed,
      dataHash: this.world.data.contentHash,
    });
  }

  private sendEnd(seat: HumanSeat): void {
    const winner = this.world.winnerTeam ?? -1;
    seat.session.send({
      t: 'matchEnd',
      winnerTeam: winner,
      youWon: this.world.player(seat.slot)?.team === winner,
      durationSeconds: Math.round(this.world.seconds),
      stats: this.world.players.map((p) => ({ slot: p.slot, name: p.name, stats: p.stats })),
    });
  }

  private sendPrivate(seat: HumanSeat): void {
    const player = this.world.player(seat.slot)!;
    const queues: PrivateStateView['queues'] = {};
    const rallies: PrivateStateView['rallies'] = {};
    for (const entity of this.world.entities.values()) {
      if (entity.alive && entity.owner === seat.slot && entity.kind === 'building') {
        if (entity.queue.length > 0) {
          queues[entity.id] = entity.queue.map((item) => ({ unitId: item.unitId, progress: item.progress / item.totalTicks }));
        }
        if (entity.buildingDef!.produces.length > 0) {
          rallies[entity.id] = [Math.round(entity.rallyX * 10) / 10, Math.round(entity.rallyY * 10) / 10];
        }
      }
    }
    seat.session.send({
      t: 'private',
      tick: this.world.tick,
      state: {
        credits: Math.floor(player.credits),
        powerProduced: player.powerProduced,
        powerUsed: player.powerUsed,
        lowPower: player.lowPower,
        hasRadar: player.hasRadar,
        queues,
        rallies,
        lastCommandSeq: seat.lastSeq,
      },
    });
  }

  private broadcast(message: Parameters<Session['send']>[0]): void {
    for (const seat of this.humans.values()) {
      if (seat.connected) {
        seat.session.send(message);
      }
    }
  }

  private seatOf(session: Session): HumanSeat | undefined {
    for (const seat of this.humans.values()) {
      if (seat.session === session) {
        return seat;
      }
    }
    return undefined;
  }
}
