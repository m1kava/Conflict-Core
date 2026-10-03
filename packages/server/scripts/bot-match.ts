/**
 * Headless bot-vs-bot match on the real simulation: `npm run simulate`. Prints a timeline and the result.
 * Used to sanity-check balance, AI, economy and performance without a browser.
 */
import { Bot, getGameData, getMap, TICK_RATE, World } from '@conflict/shared';

const maxMinutes = Number(process.argv[2] ?? 30);
const world = new World({
  map: getMap('ashfall_crossing'),
  data: getGameData(),
  players: [
    { slot: 0, team: 0, faction: 'halcyon', name: 'Bot A' },
    { slot: 1, team: 1, faction: 'halcyon', name: 'Bot B' },
  ],
  seed: Number(process.argv[3] ?? 42),
});
const bots = [new Bot(world, 0, 'normal'), new Bot(world, 1, 'normal')];
const started = performance.now();
let worstTick = 0;
while (!world.ended && world.tick < maxMinutes * 60 * TICK_RATE) {
  for (const bot of bots) {
    bot.update();
  }
  const t0 = performance.now();
  world.step();
  worstTick = Math.max(worstTick, performance.now() - t0);
  if (world.tick % (60 * TICK_RATE) === 0) {
    const counts = world.players.map((p) => {
      let units = 0;
      let buildings = 0;
      for (const e of world.entities.values()) {
        if (e.owner === p.slot) {
          if (e.kind === 'unit') units++;
          else if (e.kind === 'building') buildings++;
        }
      }
      return `${p.name}: ${Math.floor(p.credits)}cr ${units}u ${buildings}b power ${p.powerProduced}/${p.powerUsed}`;
    });
    console.log(`[${Math.round(world.seconds / 60)}m] ${counts.join(' | ')}`);
  }
}
const elapsed = performance.now() - started;
console.log(
  `Result: ${world.ended ? `team ${world.winnerTeam} wins` : 'time limit'} after ${(world.seconds / 60).toFixed(1)} min; ` +
    `${world.tick} ticks in ${elapsed.toFixed(0)} ms (avg ${(elapsed / world.tick).toFixed(3)} ms, worst ${worstTick.toFixed(2)} ms)`,
);
for (const p of world.players) {
  console.log(p.name, JSON.stringify(p.stats));
}
