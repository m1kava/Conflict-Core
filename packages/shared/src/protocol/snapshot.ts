import type { Entity, EntityKind } from '../sim/entity';
import type { World } from '../sim/world';

/**
 * Binary world snapshots, one per tick per player, containing only what that player's team may see.
 *
 * Layout (little endian):
 *   u8 type (= SNAPSHOT_TYPE) · u32 tick · u16 upsertCount · u16 removeCount
 *   upserts: u32 id + ENTITY_BODY_BYTES body each · removes: u32 id each
 *
 * Body: u8 kind(2b)|owner+1(4b)|veterancy(2b) · u8 defIndex · u16 x·64 · u16 y·64 · u8 heading ·
 *       u8 turret yaw · u8 health fraction · u8 flags · u8 progress
 *
 * WebSockets deliver reliably and in order, so each client's snapshot is a delta against the last one sent
 * to that client: unchanged entities cost nothing, entities that leave vision are listed as removals.
 */
export const SNAPSHOT_TYPE = 1;
export const POSITION_SCALE = 64;
const HEADER_BYTES = 9;
const ENTITY_BODY_BYTES = 11;
const ENTITY_BYTES = 4 + ENTITY_BODY_BYTES;
const KINDS: readonly EntityKind[] = ['unit', 'building', 'resource'];

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

const TAU = Math.PI * 2;

function encodeAngle(angle: number): number {
  return Math.round((((angle % TAU) + TAU) % TAU) / TAU * 256) & 255;
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

function writeBody(world: World, entity: Entity, out: Uint8Array, offset: number): void {
  const kind = KINDS.indexOf(entity.kind);
  out[offset] = (kind << 6) | (((entity.owner + 1) & 15) << 2) | (entity.veterancy & 3);
  out[offset + 1] = world.data.defIndex(entity.defId);
  const x = Math.max(0, Math.min(65535, Math.round(entity.x * POSITION_SCALE)));
  const y = Math.max(0, Math.min(65535, Math.round(entity.y * POSITION_SCALE)));
  out[offset + 2] = x & 255;
  out[offset + 3] = x >> 8;
  out[offset + 4] = y & 255;
  out[offset + 5] = y >> 8;
  out[offset + 6] = encodeAngle(entity.heading);
  out[offset + 7] = encodeAngle(entity.weapons[0]?.turretYaw ?? entity.heading);
  out[offset + 8] = entity.kind === 'resource' ? 255 : Math.max(1, Math.ceil((entity.hp / entity.maxHp) * 255));
  let flags = 0;
  if (entity.moving) flags |= FLAG_MOVING;
  if (entity.complete) flags |= FLAG_COMPLETE;
  if (entity.targetId !== 0) flags |= FLAG_ENGAGING;
  if (entity.cargo > 0) flags |= FLAG_CARGO;
  if (entity.kind === 'building' && world.player(entity.owner)?.lowPower) flags |= FLAG_LOW_POWER;
  out[offset + 9] = flags;
  out[offset + 10] = Math.round(Math.max(0, Math.min(1, progressOf(entity))) * 255);
}

/** Per-client delta encoder. Call `reset()` after a reconnect to force a full snapshot. */
export class SnapshotEncoder {
  private readonly sent = new Map<number, Uint8Array>();
  private readonly scratch = new Uint8Array(ENTITY_BODY_BYTES);

  reset(): void {
    this.sent.clear();
  }

  encode(world: World, team: number): Uint8Array {
    const upserts: { id: number; body: Uint8Array }[] = [];
    const seen = new Set<number>();
    for (const entity of world.entities.values()) {
      if (!entity.alive || !world.isVisibleToTeam(team, entity)) {
        continue;
      }
      seen.add(entity.id);
      writeBody(world, entity, this.scratch, 0);
      const previous = this.sent.get(entity.id);
      if (previous && equalBytes(previous, this.scratch)) {
        continue;
      }
      const body = previous ?? new Uint8Array(ENTITY_BODY_BYTES);
      body.set(this.scratch);
      this.sent.set(entity.id, body);
      upserts.push({ id: entity.id, body });
    }
    const removes: number[] = [];
    for (const id of this.sent.keys()) {
      if (!seen.has(id)) {
        removes.push(id);
      }
    }
    for (const id of removes) {
      this.sent.delete(id);
    }

    const buffer = new Uint8Array(HEADER_BYTES + upserts.length * ENTITY_BYTES + removes.length * 4);
    const view = new DataView(buffer.buffer);
    view.setUint8(0, SNAPSHOT_TYPE);
    view.setUint32(1, world.tick, true);
    view.setUint16(5, upserts.length, true);
    view.setUint16(7, removes.length, true);
    let offset = HEADER_BYTES;
    for (const upsert of upserts) {
      view.setUint32(offset, upsert.id, true);
      buffer.set(upsert.body, offset + 4);
      offset += ENTITY_BYTES;
    }
    for (const id of removes) {
      view.setUint32(offset, id, true);
      offset += 4;
    }
    return buffer;
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** Decodes a snapshot; throws on malformed input (the client treats that as a fatal protocol error). */
export function decodeSnapshot(data: ArrayBuffer | Uint8Array): DecodedSnapshot {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER_BYTES || view.getUint8(0) !== SNAPSHOT_TYPE) {
    throw new Error('Not a snapshot.');
  }
  const tick = view.getUint32(1, true);
  const upsertCount = view.getUint16(5, true);
  const removeCount = view.getUint16(7, true);
  if (bytes.byteLength !== HEADER_BYTES + upsertCount * ENTITY_BYTES + removeCount * 4) {
    throw new Error('Snapshot length mismatch.');
  }
  const upserts: EntityView[] = [];
  let offset = HEADER_BYTES;
  for (let i = 0; i < upsertCount; i++) {
    const header = bytes[offset + 4]!;
    upserts.push({
      id: view.getUint32(offset, true),
      kind: KINDS[header >> 6] ?? 'unit',
      owner: ((header >> 2) & 15) - 1,
      veterancy: header & 3,
      defIndex: bytes[offset + 5]!,
      x: view.getUint16(offset + 6, true) / POSITION_SCALE,
      y: view.getUint16(offset + 8, true) / POSITION_SCALE,
      heading: decodeAngle(bytes[offset + 10]!),
      turretYaw: decodeAngle(bytes[offset + 11]!),
      health: bytes[offset + 12]! / 255,
      flags: bytes[offset + 13]!,
      progress: bytes[offset + 14]! / 255,
    });
    offset += ENTITY_BYTES;
  }
  const removes: number[] = [];
  for (let i = 0; i < removeCount; i++) {
    removes.push(view.getUint32(offset, true));
    offset += 4;
  }
  return { tick, upserts, removes };
}
