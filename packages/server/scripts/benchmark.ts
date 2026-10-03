/**
 * Server-side performance benchmark: runs the battle scenario at increasing unit counts and reports
 * simulation tick time and per-player download (binary snapshots + JSON events). `npm run benchmark`
 */
import { encodeEvents, eventsForPlayer, getGameData, getMap, setupBattleScenario, SnapshotEncoder, TICK_RATE, World } from '@conflict/shared';

const SIZES = (process.argv[2] ?? '10,50,100,200,300,400').split(',').map(Number);
const SECONDS = Number(process.argv[3] ?? 60);

console.log(`| Units total | Avg tick (ms) | p99 tick (ms) | Worst tick (ms) | Avg download (KB/s per player) | Peak (KB/s) | Units alive at end |`);
console.log(`|---|---|---|---|---|---|---|`);
for (const perSide of SIZES.map((n) => Math.round(n / 2))) {
  const world = new World({
    map: getMap('ashfall_crossing'),
    data: getGameData(),
    players: [
      { slot: 0, team: 0, faction: 'halcyon', name: 'A' },
      { slot: 1, team: 1, faction: 'halcyon', name: 'B' },
    ],
    seed: 5,
  });
  setupBattleScenario(world, perSide);
  const encoder = new SnapshotEncoder();
  const times: number[] = [];
  const bytesPerSecond: number[] = [];
  let bytesThisSecond = 0;
  for (let tick = 0; tick < SECONDS * TICK_RATE && !world.ended; tick++) {
    const start = performance.now();
    const events = world.step();
    times.push(performance.now() - start);
    bytesThisSecond += encoder.encode(world, 0).byteLength;
    const visible = eventsForPlayer(world, 0, events);
    if (visible.length > 0) {
      bytesThisSecond += JSON.stringify({ t: 'events', tick: world.tick, events: encodeEvents(world.data, visible) }).length;
    }
    if (tick % TICK_RATE === TICK_RATE - 1) {
      bytesPerSecond.push(bytesThisSecond);
      bytesThisSecond = 0;
    }
  }
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const worst = sorted[sorted.length - 1] ?? 0;
  const avgBw = bytesPerSecond.reduce((a, b) => a + b, 0) / Math.max(1, bytesPerSecond.length) / 1024;
  const peakBw = Math.max(...bytesPerSecond) / 1024;
  const alive = [...world.entities.values()].filter((e) => e.kind === 'unit').length;
  console.log(`| ${perSide * 2} | ${avg.toFixed(2)} | ${p99.toFixed(2)} | ${worst.toFixed(2)} | ${avgBw.toFixed(1)} | ${peakBw.toFixed(1)} | ${alive} |`);
}
