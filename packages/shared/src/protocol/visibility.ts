import { eventPosition, type SimEvent } from '../sim/events';
import type { World } from '../sim/world';

/**
 * Filters a tick's events down to what one player may learn: positional combat events only where their team
 * can see, private notices only for themselves, ownership events only for the owner.
 */
export function eventsForPlayer(world: World, slot: number, events: readonly SimEvent[]): SimEvent[] {
  const team = world.player(slot)?.team ?? -1;
  const result: SimEvent[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'notice':
        if (event.player === slot) {
          result.push(event);
        }
        continue;
      case 'built':
      case 'produced':
      case 'promoted':
        if (event.owner === slot) {
          result.push(event);
        }
        continue;
      case 'defeated':
      case 'gameOver':
        result.push(event);
        continue;
      case 'fire':
        if (world.isPointVisibleToTeam(team, event.x, event.y) || world.isPointVisibleToTeam(team, event.tx, event.ty)) {
          result.push(event);
        }
        continue;
      default: {
        const position = eventPosition(event);
        if (!position || world.isPointVisibleToTeam(team, position.x, position.y) || (event.type === 'death' && world.player(event.owner)?.team === team)) {
          result.push(event);
        }
      }
    }
  }
  return result;
}
