import { spawnFromBuilding } from './orders';
import type { World } from './world';

/** Production speed multiplier while a player's power demand exceeds supply. */
const LOW_POWER_PRODUCTION_FACTOR = 0.5;

/** Recomputes each player's power balance and radar availability. */
export function updatePower(world: World): void {
  for (const player of world.players) {
    player.powerProduced = 0;
    player.powerUsed = 0;
    player.hasRadar = false;
  }
  for (const entity of world.entities.values()) {
    if (!entity.alive || entity.kind !== 'building' || !entity.complete) {
      continue;
    }
    const player = world.player(entity.owner);
    const def = entity.buildingDef!;
    if (!player) {
      continue;
    }
    if (def.power >= 0) {
      player.powerProduced += def.power;
    } else {
      player.powerUsed -= def.power;
    }
    if (def.providesRadar) {
      player.hasRadar = true;
    }
  }
  for (const player of world.players) {
    const wasLow = player.lowPower;
    player.lowPower = player.powerUsed > player.powerProduced;
    player.hasRadar = player.hasRadar && !player.lowPower;
    if (player.lowPower && !wasLow && !player.defeated) {
      world.notice(player.slot, 'lowPower');
    }
  }
}

/** Production queues and veterancy regeneration. */
export function updateEconomy(world: World): void {
  for (const entity of world.entities.values()) {
    if (!entity.alive) {
      continue;
    }
    if (entity.kind === 'building' && entity.complete && entity.queue.length > 0) {
      const item = entity.queue[0]!;
      const factor = world.player(entity.owner)?.lowPower ? LOW_POWER_PRODUCTION_FACTOR : 1;
      item.progress += factor;
      if (item.progress >= item.totalTicks) {
        entity.queue.shift();
        spawnFromBuilding(world, entity, item.unitId);
        world.notice(entity.owner, 'unitReady', entity.x, entity.y);
      }
    } else if (entity.kind === 'unit' && entity.veterancy > 0 && entity.hp < entity.maxHp) {
      const regen = world.veterancyLevel(entity).regenerationPerSecond ?? 0;
      entity.hp = Math.min(entity.maxHp, entity.hp + (entity.maxHp * regen) / world.ticks(1));
    }
  }
}
