import { getGameData } from '@conflict/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rateLimiter';
import { createGameServer, type GameServer } from '../src/server';
import { TestClient } from './testClient';

let game: GameServer;
let port: number;
const clients: TestClient[] = [];
const data = getGameData();
const hqIndex = data.defIndex('halcyon_hq');

async function connect(name: string, token?: string): Promise<TestClient> {
  const client = await TestClient.connect(port, name, token);
  clients.push(client);
  await client.waitFor('welcome');
  return client;
}

beforeAll(async () => {
  game = createGameServer({ port: 0, host: '127.0.0.1', clientDir: '/nonexistent', maxConnections: 50, maxMatches: 20, version: 'test', devTools: false });
  port = await game.listen();
});

afterAll(async () => {
  clients.forEach((c) => c.close());
  await game.close();
});

describe('handshake', () => {
  it('welcomes a client and sanitises the name', async () => {
    const client = await connect('<b>Commander</b>');
    const welcome = await client.waitFor('welcome');
    expect(welcome.name).toBe('bCommander/b');
    expect(welcome.token.length).toBeGreaterThanOrEqual(16);
  });

  it('rejects an incompatible protocol version with a clear error', async () => {
    const client = await TestClient.connect(port, 'Old', undefined, 1);
    clients.push(client);
    const error = await client.waitFor('error');
    expect(error.code).toBe('versionMismatch');
  });

  it('answers malformed messages with badMessage', async () => {
    const client = await connect('Fuzzer');
    client.socket.send('{not json');
    client.send({ t: 'command', seq: -5, command: {} });
    await client.waitFor('error', (e) => e.code === 'badMessage');
  });
});

describe('matches', () => {
  it('starts a bot match and streams snapshots, private state and accepts commands', async () => {
    const client = await connect('Solo');
    client.send({ t: 'playBot', difficulty: 'easy' });
    const start = await client.waitFor('matchStart');
    expect(start.players).toHaveLength(2);
    expect(start.dataHash).toBe(data.contentHash);
    await client.waitUntil(() => [...client.entities.values()].some((e) => e.defIndex === hqIndex && e.owner === start.slot));
    const opponentHq = [...client.entities.values()].find((e) => e.defIndex === hqIndex && e.owner !== start.slot);
    expect(opponentHq).toBeUndefined();

    const privateState = await client.waitFor('private');
    expect(privateState.state.credits).toBe(3000);

    const hq = [...client.entities.values()].find((e) => e.defIndex === hqIndex && e.owner === start.slot)!;
    client.command({ type: 'produce', building: hq.id, unit: 'halcyon_engineer' });
    await client.waitFor('private', (p) => p.state.credits === 2750 && Object.keys(p.state.queues).length === 1);
  });

  it('pairs two quick-match players with fog-filtered views', async () => {
    const a = await connect('Alpha');
    const b = await connect('Bravo');
    a.send({ t: 'quickMatch' });
    await a.waitFor('queue', (q) => q.searching);
    b.send({ t: 'quickMatch' });
    const startA = await a.waitFor('matchStart');
    const startB = await b.waitFor('matchStart');
    expect(startA.matchId).toBe(startB.matchId);
    expect(startA.slot).not.toBe(startB.slot);
    await a.waitUntil(() => a.snapshots.length > 3);
    const visibleOwners = new Set([...a.entities.values()].filter((e) => e.kind !== 'resource').map((e) => e.owner));
    expect(visibleOwners).toEqual(new Set([startA.slot]));
  });

  it('resumes a match after a reconnect with a full snapshot', async () => {
    const first = await connect('Phoenix');
    first.send({ t: 'playBot', difficulty: 'easy' });
    const start = await first.waitFor('matchStart');
    await first.waitUntil(() => first.snapshots.length > 2);
    const token = first.token;
    first.close();
    await new Promise((r) => setTimeout(r, 150));

    const second = await connect('Phoenix', token);
    const resumed = await second.waitFor('matchStart', (m) => m.resumed);
    expect(resumed.matchId).toBe(start.matchId);
    expect(resumed.slot).toBe(start.slot);
    await second.waitUntil(() => [...second.entities.values()].some((e) => e.defIndex === hqIndex && e.owner === start.slot));
  });

  it('ignores duplicate command sequence numbers', async () => {
    const client = await connect('Dup');
    client.send({ t: 'playBot', difficulty: 'easy' });
    const start = await client.waitFor('matchStart');
    await client.waitUntil(() => [...client.entities.values()].some((e) => e.defIndex === hqIndex && e.owner === start.slot));
    const hq = [...client.entities.values()].find((e) => e.defIndex === hqIndex && e.owner === start.slot)!;
    const produce = { type: 'produce', building: hq.id, unit: 'halcyon_engineer' };
    client.send({ t: 'command', seq: 1, command: produce });
    client.send({ t: 'command', seq: 1, command: produce });
    await client.waitFor('private', (p) => p.state.lastCommandSeq === 1);
    await new Promise((r) => setTimeout(r, 300));
    const latest = client.messages.filter((m) => m.t === 'private').at(-1);
    expect(latest?.t === 'private' && latest.state.credits).toBe(2750);
  });

  it('runs a private room with a code', async () => {
    const host = await connect('Host');
    const guest = await connect('Guest');
    host.send({ t: 'createRoom' });
    const room = await host.waitFor('room');
    expect(room.code).toMatch(/^[A-Z0-9]{5}$/);
    guest.send({ t: 'joinRoom', code: room.code.toLowerCase() });
    await host.waitFor('room', (r) => r.slots.some((s) => s.name === 'Guest'));
    host.send({ t: 'startRoom' });
    await host.waitFor('error', (e) => e.code === 'notReady');
    guest.send({ t: 'setReady', ready: true });
    await host.waitFor('room', (r) => r.canStart);
    host.send({ t: 'startRoom' });
    const [a, b] = await Promise.all([host.waitFor('matchStart'), guest.waitFor('matchStart')]);
    expect(a.matchId).toBe(b.matchId);
  });

  it('reports unknown room codes', async () => {
    const client = await connect('Lost');
    client.send({ t: 'joinRoom', code: 'ZZZZZ' });
    const error = await client.waitFor('error');
    expect(error.code).toBe('roomNotFound');
  });

  it('ends the match when a player surrenders', async () => {
    const client = await connect('Quitter');
    client.send({ t: 'playBot', difficulty: 'easy' });
    await client.waitFor('matchStart');
    client.command({ type: 'surrender' });
    const end = await client.waitFor('matchEnd');
    expect(end.youWon).toBe(false);
    expect(end.stats).toHaveLength(2);
  });
});

describe('rate limiter', () => {
  it('allows bursts then refills over time', () => {
    const limiter = new RateLimiter(3, 2, 0);
    expect([limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0), limiter.tryTake(0)]).toEqual([true, true, true, false]);
    expect(limiter.tryTake(499)).toBe(false);
    expect(limiter.tryTake(500)).toBe(true);
  });
});

describe('development tools', () => {
  it('refuses scripted battles unless DEV_TOOLS is enabled', async () => {
    const client = await connect('Tinkerer');
    client.send({ t: 'devBattle', units: 50 });
    const error = await client.waitFor('error');
    expect(error.message).toContain('disabled');
  });
});
