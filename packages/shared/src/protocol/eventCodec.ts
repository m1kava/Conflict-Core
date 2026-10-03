import type { GameData } from '../data/gameData';
import type { NoticeCode, SimEvent } from '../sim/events';

/**
 * Compact wire form for gameplay events: short tuples with numeric indices instead of objects with string keys
 * (a shot is ~40 bytes instead of ~150). Positions are sent in decimetres.
 */
export type EncodedEvent = (string | number)[];

const NOTICE_CODES: readonly NoticeCode[] = [
  'insufficientFunds',
  'cannotBuildThere',
  'requirementsMissing',
  'queueFull',
  'lowPower',
  'underAttack',
  'unitReady',
  'constructionComplete',
  'buildingLost',
  'unitLost',
  'supplyDepleted',
];

const dm = (value: number): number => Math.round(value * 10);
const m = (value: unknown): number => Number(value) / 10;

export function encodeEvents(data: GameData, events: readonly SimEvent[]): EncodedEvent[] {
  const out: EncodedEvent[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'fire':
        out.push(['f', e.shooter, data.weaponIndex(e.weapon), dm(e.x), dm(e.y), dm(e.tx), dm(e.ty), e.target, e.flight, e.hit ? 1 : 0]);
        break;
      case 'impact':
        out.push(['i', data.weaponIndex(e.weapon), dm(e.x), dm(e.y)]);
        break;
      case 'death':
        out.push(['d', e.id, data.defIndex(e.defId), e.owner, dm(e.x), dm(e.y), e.kind === 'building' ? 1 : 0]);
        break;
      case 'built':
        out.push(['b', e.id, e.owner, data.defIndex(e.defId)]);
        break;
      case 'produced':
        out.push(['p', e.id, e.owner, data.defIndex(e.defId)]);
        break;
      case 'promoted':
        out.push(['v', e.id, e.owner, e.level]);
        break;
      case 'notice':
        out.push(e.x === undefined || e.y === undefined ? ['n', e.player, NOTICE_CODES.indexOf(e.code)] : ['n', e.player, NOTICE_CODES.indexOf(e.code), dm(e.x), dm(e.y)]);
        break;
      case 'defeated':
        out.push(['x', e.player]);
        break;
      case 'gameOver':
        out.push(['g', e.winnerTeam]);
        break;
    }
  }
  return out;
}

/** Decodes events from the server; unknown or malformed entries are skipped. */
export function decodeEvents(data: GameData, encoded: readonly unknown[]): SimEvent[] {
  const events: SimEvent[] = [];
  for (const item of encoded) {
    if (!Array.isArray(item)) {
      continue;
    }
    const [type, ...a] = item as unknown[];
    const n = (i: number): number => Number(a[i]);
    switch (type) {
      case 'f':
        events.push({ type: 'fire', shooter: n(0), weapon: data.weaponIds[n(1)] ?? '', x: m(a[2]), y: m(a[3]), tx: m(a[4]), ty: m(a[5]), target: n(6), flight: n(7), hit: a[8] === 1 });
        break;
      case 'i':
        events.push({ type: 'impact', weapon: data.weaponIds[n(0)] ?? '', x: m(a[1]), y: m(a[2]) });
        break;
      case 'd':
        events.push({ type: 'death', id: n(0), defId: data.entityDefIds[n(1)] ?? '', owner: n(2), x: m(a[3]), y: m(a[4]), kind: a[5] === 1 ? 'building' : 'unit' });
        break;
      case 'b':
        events.push({ type: 'built', id: n(0), owner: n(1), defId: data.entityDefIds[n(2)] ?? '' });
        break;
      case 'p':
        events.push({ type: 'produced', id: n(0), owner: n(1), defId: data.entityDefIds[n(2)] ?? '' });
        break;
      case 'v':
        events.push({ type: 'promoted', id: n(0), owner: n(1), level: n(2) });
        break;
      case 'n': {
        const code = NOTICE_CODES[n(1)];
        if (code) {
          events.push(a.length >= 4 ? { type: 'notice', player: n(0), code, x: m(a[2]), y: m(a[3]) } : { type: 'notice', player: n(0), code });
        }
        break;
      }
      case 'x':
        events.push({ type: 'defeated', player: n(0) });
        break;
      case 'g':
        events.push({ type: 'gameOver', winnerTeam: n(0) });
        break;
    }
  }
  return events;
}
