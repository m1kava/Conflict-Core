import { defeatPlayer } from './orders';
import type { World } from './world';

const CHECK_INTERVAL = 15;

/**
 * A player is defeated when they have no critical structures (HQ, production, depot — complete or under
 * construction) and no builders left. The match ends when at most one team still has an undefeated player.
 */
export function updateVictory(world: World): void {
  if (world.tick % CHECK_INTERVAL !== 0 || world.ended) {
    return;
  }
  const alive = new Set<number>();
  for (const entity of world.entities.values()) {
    if (!entity.alive || entity.owner < 0) {
      continue;
    }
    if ((entity.kind === 'building' && entity.buildingDef?.critical) || (entity.kind === 'unit' && entity.unitDef?.canConstruct)) {
      alive.add(entity.owner);
    }
  }
  for (const player of world.players) {
    if (!player.defeated && !alive.has(player.slot)) {
      defeatPlayer(world, player.slot);
    }
  }
  const teams = new Set(world.players.filter((p) => !p.defeated).map((p) => p.team));
  if (teams.size <= 1) {
    world.winnerTeam = teams.size === 1 ? [...teams][0]! : -1;
    world.events.push({ type: 'gameOver', winnerTeam: world.winnerTeam });
  }
}
