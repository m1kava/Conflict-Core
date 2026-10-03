import type { Entity, EntityKind } from '../sim/entity';
import type { World } from '../sim/world';

/**
 * Binary world snapshots, one per tick per player, containing only what that player's team may see.
 *
 * WebSockets deliver reliably and in order, so each snapshot is a delta against the previous one sent to
 * that client. Per entity only the fields that changed are written:
 *
 *   header: u8 type · u32 tick · varint upsertCount · varint removeCount
 *   upsert: varint idDelta · u8 fieldMask · fields in mask order
 *     FULL (new entity): u8 kind|owner|vet · u8 defIndex · u16 x · u16 y · u8 heading · u8 turret ·
 *                        u8 health · u8 flags · u8 progress
 *     POS_DELTA: i8 dx · i8 dy (1/64 m units)     POS_ABS: u16 x · u16 y
 *     HEADING · TURRET · HEALTH · FLAGS · PROGRESS: u8 each      META: u8 kind|owner|vet · u8 defIndex
 *   remove: varint idDelta each
 *
 * A moving tank costs ~6 bytes per tick; idle units and structures cost nothing.
 */
export const SNAPSHOT_TYPE = 1;
export const POSITION_SCALE = 64;

const KINDS: readonly EntityKind[] = ['unit', 'building', 'resource'];

const FIELD_FULL = 1 << 0;
const FIELD_POS_DELTA = 1 << 1;
const FIELD_POS_ABS = 1 << 2;
const FIELD_HEADING = 1 << 3;
const FIELD_TURRET = 1 << 4;
const FIELD_HEALTH = 1 << 5;
const FIELD_FLAGS = 1 << 6;
const FIELD_PROGRESS_META = 1 << 7;

export const FLAG_MOVING = 1;
export const FLAG_COMPLETE = 2;
export const FLAG_ENGAGING = 4;
export const FLAG_CARGO = 8;
export const FLAG_LOW_POWER = 16;

export interface EntityView {
  id: number;
  kind: EntityKind;
  owner: number;
  veterancy: number;
  defIndex: number;
  x: number;
  y: number;
  heading: number;
  turretYaw: number;
  health: number;
  flags: number;
  progress: number;
}

export interface DecodedSnapshot {
  tick: number;
  upserts: EntityView[];
  removes: number[];
}

/** Quantised entity state as sent on the wire. */
interface Quantized {
  meta: number;
  defIndex: number;
  x: number;
  y: number;
  heading: number;
  turret: number;
  health: number;
  flags: number;
  progress: number;
}

const TAU = Math.PI * 2;

function encodeAngle(angle: number): number {
  return Math.round(((((angle % TAU) + TAU) % TAU) / TAU) * 256) & 255;
}

function decodeAngle(value: number): number {
  return (value / 256) * TAU;
}

function progressOf(entity: Entity): number {
  if (entity.kind === 'building') {
    if (!entity.complete) {
      return entity.constructionProgress;
    }
    const item = entity.queue[0];
    return item ? item.progress / item.totalTicks : 0;
  }
  if (entity.kind === 'resource') {
    return entity.maxHp > 0 ? entity.supply / entity.maxHp : 0;
  }
  const capacity = entity.unitDef?.harvestCapacity ?? 0;
  return capacity > 0 ? entity.cargo / capacity : 0;
}

function quantize(world: World, entity: Entity, out: Quantized): void {
  out.meta = (KINDS.indexOf(entity.kind) << 6) | (((entity.owner + 1) & 15) << 2) | (entity.veterancy & 3);
  out.defIndex = world.data.defIndex(entity.defId);
  out.x = Math.max(0, Math.min(65535, Math.round(entity.x * POSITION_SCALE)));
  out.y = Math.max(0, Math.min(65535, Math.round(entity.y * POSITION_SCALE)));
  out.heading = encodeAngle(entity.heading);
  out.turret = encodeAngle(entity.weapons[0]?.turretYaw ?? entity.heading);
  out.health = entity.kind === 'resource' ? 255 : Math.max(1, Math.ceil((entity.hp / entity.maxHp) * 255));
  let flags = 0;
  if (entity.moving) flags |= FLAG_MOVING;
  if (entity.complete) flags |= FLAG_COMPLETE;
  if (entity.targetId !== 0) flags |= FLAG_ENGAGING;
  if (entity.cargo > 0) flags |= FLAG_CARGO;
  if (entity.kind === 'building' && world.player(entity.owner)?.lowPower) flags |= FLAG_LOW_POWER;
  out.flags = flags;
  out.progress = Math.round(Math.max(0, Math.min(1, progressOf(entity))) * 255);
}

function emptyQuantized(): Quantized {
  return { meta: 0, defIndex: 0, x: 0, y: 0, heading: 0, turret: 0, health: 0, flags: 0, progress: 0 };
}

/** Growable byte buffer with varint support (reused between snapshots). */
class ByteWriter {
  private buffer = new Uint8Array(4096);
  length = 0;

  reset(): void {
    this.length = 0;
  }

  u8(value: number): void {
    this.ensure(1);
    this.buffer[this.length++] = value & 255;
  }

  u16(value: number): void {
    this.u8(value);
    this.u8(value >> 8);
  }

  u32(value: number): void {
    this.u16(value & 0xffff);
    this.u16(value >>> 16);
  }

  varint(value: number): void {
    let v = value >>> 0;
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.u8(v);
  }

  bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }

  private ensure(extra: number): void {
    if (this.length + extra > this.buffer.length) {
      const next = new Uint8Array(Math.max(this.buffer.length * 2, this.length + extra));
      next.set(this.buffer);
      this.buffer = next;
    }
  }
}

/** Per-client delta encoder. Call `reset()` after a reconnect to force full state for everything. */
export class SnapshotEncoder {
  private readonly sent = new Map<number, Quantized>();
  private readonly writer = new ByteWriter();
  private readonly body = new ByteWriter();
  private readonly current = emptyQuantized();
  private readonly seen = new Set<number>();

  reset(): void {
    this.sent.clear();
  }

  encode(world: World, team: number): Uint8Array {
    const body = this.body;
    body.reset();
    this.seen.clear();
    let upserts = 0;
    let previousId = 0;
    for (const entity of world.entities.values()) {
      if (!entity.alive || !world.isVisibleToTeam(team, entity)) {
        continue;
      }
      this.seen.add(entity.id);
      const q = this.current;
      quantize(world, entity, q);
      const last = this.sent.get(entity.id);
      let mask = 0;
      if (!last) {
        mask = FIELD_FULL;
      } else {
        const dx = q.x - last.x;
        const dy = q.y - last.y;
        if (dx !== 0 || dy !== 0) {
          mask |= dx >= -128 && dx <= 127 && dy >= -128 && dy <= 127 ? FIELD_POS_DELTA : FIELD_POS_ABS;
        }
        if (q.heading !== last.heading) mask |= FIELD_HEADING;
        if (q.turret !== last.turret) mask |= FIELD_TURRET;
        if (q.health !== last.health) mask |= FIELD_HEALTH;
        if (q.flags !== last.flags) mask |= FIELD_FLAGS;
        if (q.progress !== last.progress || q.meta !== last.meta || q.defIndex !== last.defIndex) mask |= FIELD_PROGRESS_META;
        if (mask === 0) {
          continue;
        }
      }
      body.varint(entity.id - previousId);
      previousId = entity.id;
      body.u8(mask);
      if (mask & FIELD_FULL) {
        body.u8(q.meta);
        body.u8(q.defIndex);
        body.u16(q.x);
        body.u16(q.y);
        body.u8(q.heading);
        body.u8(q.turret);
        body.u8(q.health);
        body.u8(q.flags);
        body.u8(q.progress);
      } else {
        if (mask & FIELD_POS_DELTA) {
          body.u8(q.x - last!.x);
          body.u8(q.y - last!.y);
        }
        if (mask & FIELD_POS_ABS) {
          body.u16(q.x);
          body.u16(q.y);
        }
        if (mask & FIELD_HEADING) body.u8(q.heading);
        if (mask & FIELD_TURRET) body.u8(q.turret);
        if (mask & FIELD_HEALTH) body.u8(q.health);
        if (mask & FIELD_FLAGS) body.u8(q.flags);
        if (mask & FIELD_PROGRESS_META) {
          body.u8(q.progress);
          body.u8(q.meta);
          body.u8(q.defIndex);
        }
      }
      const stored = last ?? emptyQuantized();
      Object.assign(stored, q);
      this.sent.set(entity.id, stored);
      upserts++;
    }

    const removes: number[] = [];
    for (const id of this.sent.keys()) {
      if (!this.seen.has(id)) {
        removes.push(id);
      }
    }
    removes.sort((a, b) => a - b);

    const header = this.writer;
    header.reset();
    header.u8(SNAPSHOT_TYPE);
    header.u32(world.tick);
    header.varint(upserts);
    header.varint(removes.length);
    let previous = 0;
    for (const id of removes) {
      this.sent.delete(id);
      body.varint(id - previous);
      previous = id;
    }
    const out = new Uint8Array(header.length + body.length);
    out.set(header.bytes(), 0);
    out.set(body.bytes(), header.length);
    return out;
  }
}

/**
 * Stateful decoder mirroring one connection's encoder. Returns complete entity views for every entity that
 * changed. Call `reset()` when the server resynchronises (after a reconnect).
 */
export class SnapshotDecoder {
  private readonly state = new Map<number, Quantized>();

  reset(): void {
    this.state.clear();
  }

  decode(data: ArrayBuffer | Uint8Array): DecodedSnapshot {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let offset = 0;
    const need = (count: number): void => {
      if (offset + count > bytes.length) {
        throw new Error('Truncated snapshot.');
      }
    };
    const u8 = (): number => {
      need(1);
      return bytes[offset++]!;
    };
    const i8 = (): number => {
      const v = u8();
      return v > 127 ? v - 256 : v;
    };
    const u16 = (): number => u8() | (u8() << 8);
    const varint = (): number => {
      let result = 0;
      for (let shift = 0; shift < 35; shift += 7) {
        const b = u8();
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) {
          return result >>> 0;
        }
      }
      throw new Error('Bad varint.');
    };

    if (u8() !== SNAPSHOT_TYPE) {
      throw new Error('Not a snapshot.');
    }
    const tick = (u16() | (u16() << 16)) >>> 0;
    const upsertCount = varint();
    const removeCount = varint();
    const upserts: EntityView[] = [];
    let id = 0;
    for (let i = 0; i < upsertCount; i++) {
      id += varint();
      const mask = u8();
      let q = this.state.get(id);
      if (mask & FIELD_FULL) {
        q = { meta: u8(), defIndex: u8(), x: u16(), y: u16(), heading: u8(), turret: u8(), health: u8(), flags: u8(), progress: u8() };
        this.state.set(id, q);
      } else {
        if (!q) {
          throw new Error(`Delta for unknown entity ${id}.`);
        }
        if (mask & FIELD_POS_DELTA) {
          q.x += i8();
          q.y += i8();
        }
        if (mask & FIELD_POS_ABS) {
          q.x = u16();
          q.y = u16();
        }
        if (mask & FIELD_HEADING) q.heading = u8();
        if (mask & FIELD_TURRET) q.turret = u8();
        if (mask & FIELD_HEALTH) q.health = u8();
        if (mask & FIELD_FLAGS) q.flags = u8();
        if (mask & FIELD_PROGRESS_META) {
          q.progress = u8();
          q.meta = u8();
          q.defIndex = u8();
        }
      }
      upserts.push({
        id,
        kind: KINDS[q.meta >> 6] ?? 'unit',
        owner: ((q.meta >> 2) & 15) - 1,
        veterancy: q.meta & 3,
        defIndex: q.defIndex,
        x: q.x / POSITION_SCALE,
        y: q.y / POSITION_SCALE,
        heading: decodeAngle(q.heading),
        turretYaw: decodeAngle(q.turret),
        health: q.health / 255,
        flags: q.flags,
        progress: q.progress / 255,
      });
    }
    const removes: number[] = [];
    id = 0;
    for (let i = 0; i < removeCount; i++) {
      id += varint();
      removes.push(id);
      this.state.delete(id);
    }
    if (offset !== bytes.length) {
      throw new Error('Trailing bytes in snapshot.');
    }
    return { tick, upserts, removes };
  }
}
