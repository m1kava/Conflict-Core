import {
  FLAG_COMPLETE,
  FLAG_ENGAGING,
  FLAG_MOVING,
  FOG_CELL_SIZE,
  Terrain,
  getGameData,
  getMap,
  wrapAngle,
  type BuildingDef,
  type DecodedSnapshot,
  type EntityKind,
  type EntityView,
  type MatchPlayerView,
  type PrivateStateView,
  type SimEvent,
  type UnitDef,
} from '@conflict/shared';

interface Sample {
  tick: number;
  x: number;
  y: number;
  heading: number;
  turret: number;
}

/** Client-side view of one entity: latest replicated state plus a short history for interpolation. */
export interface ClientEntity {
  id: number;
  kind: EntityKind;
  defId: string;
  owner: number;
  veterancy: number;
  health: number;
  flags: number;
  progress: number;
  unitDef?: UnitDef;
  buildingDef?: BuildingDef;
  samples: Sample[];
  /** Interpolated render state, refreshed by `updateRender`. */
  x: number;
  y: number;
  heading: number;
  turret: number;
  /** Not currently replicated: last known state of an enemy structure under fog. */
  ghost: boolean;
  lastUpdateTick: number;
}

export interface TimedEvent {
  tick: number;
  event: SimEvent;
}

const MAX_SAMPLES = 6;
const INTERPOLATION_DELAY_TICKS = 2;
const VISION_REFRESH_MS = 150;
const MAX_RENDER_DRIFT_TICKS = 8;
const DRIFT_CORRECTION = 0.08;

/**
 * Everything the client knows about the match, built only from what the server chose to send. Handles
 * snapshot interpolation, delayed event playback (events play when render time reaches their tick),
 * own-vision fog (visible / explored) and "last known" ghosts of enemy structures.
 */
export class ClientWorld {
  readonly data = getGameData();
  readonly terrain: Terrain;
  readonly entities = new Map<number, ClientEntity>();
  readonly fogWidth: number;
  readonly fogHeight: number;
  /** 0 unexplored, 1 explored, 2 visible. */
  readonly fog: Uint8Array;
  fogVersion = 0;
  privateState: PrivateStateView | null = null;
  latestTick = 0;
  renderTick = 0;
  ended = false;

  private readonly pendingEvents: TimedEvent[] = [];
  private readonly pendingRemovals: { tick: number; id: number }[] = [];
  private readonly deaths = new Set<number>();
  private latestTickTime = 0;
  private lastUpdateTime = 0;
  private lastVisionUpdate = -Infinity;
  private readonly tickMs: number;

  constructor(
    readonly mapId: string,
    readonly slot: number,
    readonly players: MatchPlayerView[],
    tickRate: number,
    startTick: number,
  ) {
    this.terrain = new Terrain(getMap(mapId));
    this.fogWidth = Math.ceil(this.terrain.map.width / FOG_CELL_SIZE);
    this.fogHeight = Math.ceil(this.terrain.map.height / FOG_CELL_SIZE);
    this.fog = new Uint8Array(this.fogWidth * this.fogHeight);
    this.tickMs = 1000 / tickRate;
    this.latestTick = startTick;
    this.renderTick = startTick;
  }

  get team(): number {
    return this.players.find((p) => p.slot === this.slot)?.team ?? this.slot;
  }

  teamOf(owner: number): number {
    return this.players.find((p) => p.slot === owner)?.team ?? -1;
  }

  isAlly(owner: number): boolean {
    return owner >= 0 && this.teamOf(owner) === this.team;
  }

  isEnemy(owner: number): boolean {
    return owner >= 0 && this.teamOf(owner) !== this.team;
  }

  /** Called after a reconnect: the next snapshot is complete, so forget replicated (non-ghost) state. */
  resetForResync(): void {
    for (const [id, entity] of this.entities) {
      if (!entity.ghost) {
        this.entities.delete(id);
      }
    }
    this.pendingRemovals.length = 0;
  }

  applySnapshot(snapshot: DecodedSnapshot, now: number): void {
    if (snapshot.tick >= this.latestTick) {
      this.latestTick = snapshot.tick;
      this.latestTickTime = now;
    }
    for (const view of snapshot.upserts) {
      this.upsert(view, snapshot.tick);
    }
    for (const id of snapshot.removes) {
      this.pendingRemovals.push({ tick: snapshot.tick, id });
    }
  }

  applyEvents(tick: number, events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'death') {
        this.deaths.add(event.id);
      }
      this.pendingEvents.push({ tick, event });
    }
  }

  applyPrivate(state: PrivateStateView): void {
    this.privateState = state;
  }

  /** Advances render time; returns events whose tick has been reached. */
  update(now: number): TimedEvent[] {
    const sinceLatest = (now - this.latestTickTime) / this.tickMs;
    const target = this.latestTick + Math.min(sinceLatest, 1.5) - INTERPOLATION_DELAY_TICKS;
    const frameTicks = this.lastUpdateTime > 0 ? (now - this.lastUpdateTime) / this.tickMs : 0;
    this.lastUpdateTime = now;
    if (Math.abs(target - this.renderTick) > MAX_RENDER_DRIFT_TICKS) {
      this.renderTick = target;
    } else {
      // Advance at real-time speed, then nudge toward the target to absorb network jitter smoothly.
      this.renderTick += frameTicks;
      this.renderTick += (target - this.renderTick) * DRIFT_CORRECTION;
      this.renderTick = Math.min(this.renderTick, target + 0.5);
    }

    const due: TimedEvent[] = [];
    let write = 0;
    for (const item of this.pendingEvents) {
      if (item.tick <= this.renderTick + 0.5) {
        due.push(item);
      } else {
        this.pendingEvents[write++] = item;
      }
    }
    this.pendingEvents.length = write;

    write = 0;
    for (const removal of this.pendingRemovals) {
      if (removal.tick <= this.renderTick + 0.5) {
        this.processRemoval(removal.id);
      } else {
        this.pendingRemovals[write++] = removal;
      }
    }
    this.pendingRemovals.length = write;

    for (const entity of this.entities.values()) {
      this.interpolate(entity);
    }
    if (now - this.lastVisionUpdate > VISION_REFRESH_MS) {
      this.lastVisionUpdate = now;
      this.updateVision();
    }
    return due;
  }

  /** Whether a world point is currently visible to the local team (own-vision fog). */
  isVisible(x: number, y: number): boolean {
    return this.fog[this.fogIndex(x, y)] === 2;
  }

  isExplored(x: number, y: number): boolean {
    return (this.fog[this.fogIndex(x, y)] ?? 0) >= 1;
  }

  ownEntities(): ClientEntity[] {
    return [...this.entities.values()].filter((e) => e.owner === this.slot && !e.ghost);
  }

  private upsert(view: EntityView, tick: number): void {
    let entity = this.entities.get(view.id);
    const defId = this.data.entityDefIds[view.defIndex] ?? 'supply_field';
    if (!entity) {
      entity = {
        id: view.id,
        kind: view.kind,
        defId,
        owner: view.owner,
        veterancy: view.veterancy,
        health: view.health,
        flags: view.flags,
        progress: view.progress,
        samples: [],
        x: view.x,
        y: view.y,
        heading: view.heading,
        turret: view.turretYaw,
        ghost: false,
        lastUpdateTick: tick,
        ...(view.kind === 'unit' ? { unitDef: this.data.units.get(defId) } : {}),
        ...(view.kind === 'building' ? { buildingDef: this.data.buildings.get(defId) } : {}),
      };
      this.entities.set(view.id, entity);
    }
    entity.ghost = false;
    entity.owner = view.owner;
    entity.veterancy = view.veterancy;
    entity.health = view.health;
    entity.flags = view.flags;
    entity.progress = view.progress;
    const samples = entity.samples;
    const last = samples[samples.length - 1];
    if (last && last.tick < tick - 1) {
      // Unchanged since `last.tick`: pin the old state at tick-1 so motion starts at the right time.
      samples.push({ ...last, tick: tick - 1 });
    }
    samples.push({ tick, x: view.x, y: view.y, heading: view.heading, turret: view.turretYaw });
    while (samples.length > MAX_SAMPLES) {
      samples.shift();
    }
    entity.lastUpdateTick = tick;
  }

  private processRemoval(id: number): void {
    const entity = this.entities.get(id);
    if (!entity) {
      return;
    }
    if (!this.deaths.has(id) && entity.kind === 'building' && this.isEnemy(entity.owner)) {
      entity.ghost = true;
      entity.samples = entity.samples.slice(-1);
      return;
    }
    this.deaths.delete(id);
    this.entities.delete(id);
  }

  private interpolate(entity: ClientEntity): void {
    const samples = entity.samples;
    if (samples.length === 0) {
      return;
    }
    const t = this.renderTick;
    let a = samples[0]!;
    let b = a;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (samples[i]!.tick <= t) {
        a = samples[i]!;
        b = samples[i + 1] ?? a;
        break;
      }
    }
    if (t < samples[0]!.tick) {
      a = samples[0]!;
      b = a;
    }
    const span = b.tick - a.tick;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.tick) / span)) : 0;
    entity.x = a.x + (b.x - a.x) * f;
    entity.y = a.y + (b.y - a.y) * f;
    entity.heading = a.heading + wrapAngle(b.heading - a.heading) * f;
    entity.turret = a.turret + wrapAngle(b.turret - a.turret) * f;
  }

  private fogIndex(x: number, y: number): number {
    const fx = Math.min(this.fogWidth - 1, Math.max(0, Math.floor(x / FOG_CELL_SIZE)));
    const fy = Math.min(this.fogHeight - 1, Math.max(0, Math.floor(y / FOG_CELL_SIZE)));
    return fy * this.fogWidth + fx;
  }

  /** Recomputes visible cells from own and allied entities; explored cells stay explored. */
  private updateVision(): void {
    const fog = this.fog;
    for (let i = 0; i < fog.length; i++) {
      if (fog[i] === 2) {
        fog[i] = 1;
      }
    }
    for (const entity of this.entities.values()) {
      if (entity.ghost || !this.isAlly(entity.owner)) {
        continue;
      }
      const radius = entity.unitDef?.visionRadius ?? entity.buildingDef?.visionRadius ?? 0;
      const effective = entity.kind === 'building' && (entity.flags & FLAG_COMPLETE) === 0 ? Math.min(radius, 16) : radius;
      const r = Math.round(effective / FOG_CELL_SIZE);
      const cx = Math.floor(entity.x / FOG_CELL_SIZE);
      const cy = Math.floor(entity.y / FOG_CELL_SIZE);
      const limit = (r + 0.5) * (r + 0.5);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= this.fogHeight) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= this.fogWidth || dx * dx + dy * dy > limit) continue;
          fog[y * this.fogWidth + x] = 2;
        }
      }
    }
    // Ghosts are cleared once their location is seen again and the structure is no longer there.
    for (const [id, entity] of this.entities) {
      if (entity.ghost && this.isVisible(entity.x, entity.y)) {
        this.entities.delete(id);
      }
    }
    this.fogVersion++;
  }
}

export function isMoving(entity: ClientEntity): boolean {
  return (entity.flags & FLAG_MOVING) !== 0;
}

export function isEngaging(entity: ClientEntity): boolean {
  return (entity.flags & FLAG_ENGAGING) !== 0;
}

export function isComplete(entity: ClientEntity): boolean {
  return (entity.flags & FLAG_COMPLETE) !== 0;
}
