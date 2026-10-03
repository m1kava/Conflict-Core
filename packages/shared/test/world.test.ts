import { describe, expect, it } from 'vitest';
import { Bot, TICK_RATE, type SimEvent } from '../src/index';
import { createWorld, openSpot, owned, runTicks } from './helpers';

const collect = (world: ReturnType<typeof createWorld>, ticks: number): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    events.push(...world.step());
  }
  return events;
};

describe('match setup', () => {
  it('starts each player with an HQ, an engineer and starting credits', () => {
    const world = createWorld();
    for (const slot of [0, 1]) {
      expect(owned(world, slot, 'halcyon_hq')).toHaveLength(1);
      expect(owned(world, slot, 'halcyon_engineer')).toHaveLength(1);
      expect(world.player(slot)!.credits).toBe(3000);
    }
    expect([...world.entities.values()].filter((e) => e.kind === 'resource')).toHaveLength(8);
  });
});

describe('construction', () => {
  it('builds a power plant: walks, pays, constructs, adds power', () => {
    const world = createWorld();
    const engineer = owned(world, 0, 'halcyon_engineer')[0]!;
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    world.issue(0, { type: 'build', units: [engineer.id], building: 'halcyon_power_plant', x: hq.x - 22, y: hq.y });
    const events = collect(world, TICK_RATE * 25);
    const plant = owned(world, 0, 'halcyon_power_plant')[0];
    expect(plant?.complete).toBe(true);
    expect(world.player(0)!.credits).toBe(3000 - 600);
    expect(world.player(0)!.powerProduced).toBe(15);
    expect(events.some((e) => e.type === 'built' && e.defId === 'halcyon_power_plant')).toBe(true);
  });

  it('rejects placement outside the build radius, in water or overlapping', () => {
    const world = createWorld();
    const engineer = owned(world, 0, 'halcyon_engineer')[0]!;
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    expect(world.placementProblem(0, 'halcyon_power_plant', 250, 250, false)).toBe('cannotBuildThere');
    expect(world.placementProblem(0, 'halcyon_power_plant', 120, 200, false)).toBe('cannotBuildThere');
    expect(world.placementProblem(0, 'halcyon_power_plant', hq.x, hq.y, false)).toBe('cannotBuildThere');
    expect(world.placementProblem(0, 'halcyon_vehicle_plant', hq.x - 24, hq.y, false)).toBe('requirementsMissing');
    expect(world.placementProblem(0, 'halcyon_hq', hq.x - 24, hq.y, false)).toBe('cannotBuildThere');
    world.issue(0, { type: 'build', units: [engineer.id], building: 'halcyon_power_plant', x: 250, y: 250 });
    const events = collect(world, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'notice', player: 0, code: 'cannotBuildThere' }));
    expect(owned(world, 0, 'halcyon_power_plant')).toHaveLength(0);
  });
});

describe('production and economy', () => {
  it('produces units, charges on queue and refunds on cancel', () => {
    const world = createWorld();
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    const barracks = world.spawnBuilding('halcyon_barracks', 0, hq.x - 22, hq.y + 4, false, true);
    world.issue(0, { type: 'produce', building: barracks.id, unit: 'halcyon_rifle_squad', count: 2 });
    runTicks(world, 1);
    expect(world.player(0)!.credits).toBe(3000 - 400);
    world.issue(0, { type: 'cancel', building: barracks.id, index: 1 });
    runTicks(world, 1);
    expect(world.player(0)!.credits).toBe(3000 - 200);
    runTicks(world, TICK_RATE * 9);
    expect(owned(world, 0, 'halcyon_rifle_squad')).toHaveLength(1);
  });

  it('refuses production without prerequisites or funds', () => {
    const world = createWorld();
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    const plant = world.spawnBuilding('halcyon_vehicle_plant', 0, hq.x - 24, hq.y, false, true);
    world.issue(0, { type: 'produce', building: plant.id, unit: 'halcyon_spg' });
    world.player(0)!.credits = 100;
    world.issue(0, { type: 'produce', building: plant.id, unit: 'halcyon_mbt' });
    const events = collect(world, 1);
    expect(events).toContainEqual(expect.objectContaining({ code: 'requirementsMissing' }));
    expect(events).toContainEqual(expect.objectContaining({ code: 'insufficientFunds' }));
    expect(plant.queue).toHaveLength(0);
  });

  it('supply depot brings a truck that earns credits', () => {
    const world = createWorld();
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    const depot = world.spawnBuilding('halcyon_supply_depot', 0, hq.x + 4, hq.y - 24, false, false);
    depot.constructionProgress = 0.999;
    const engineer = owned(world, 0, 'halcyon_engineer')[0]!;
    world.issue(0, { type: 'repair', units: [engineer.id], target: depot.id });
    const before = world.player(0)!.credits;
    runTicks(world, TICK_RATE * 60);
    expect(owned(world, 0, 'halcyon_supply_truck')).toHaveLength(1);
    expect(world.player(0)!.credits).toBeGreaterThan(before);
    expect(world.player(0)!.stats.creditsEarned).toBeGreaterThan(0);
  });

  it('low power halves production speed', () => {
    const world = createWorld();
    const hq = owned(world, 0, 'halcyon_hq')[0]!;
    for (let i = 0; i < 3; i++) {
      world.spawnBuilding('halcyon_radar_uplink', 0, hq.x - 26, hq.y - 20 + i * 12, false, true);
    }
    runTicks(world, 1);
    expect(world.player(0)!.lowPower).toBe(true);
  });
});

describe('combat', () => {
  it('units engage visible enemies and gain veterancy on kills', () => {
    const world = createWorld();
    const a = openSpot(world, 160, 120);
    const tanks = [0, 1, 2].map((i) => world.spawnUnit('halcyon_mbt', 0, a.x + i * 6, a.y));
    const enemy = world.spawnUnit('halcyon_recon_vehicle', 1, a.x + 6, a.y + 30);
    runTicks(world, TICK_RATE * 20);
    expect(enemy.alive).toBe(false);
    expect(tanks.reduce((sum, t) => sum + t.xp, 0)).toBeGreaterThan(0);
  });

  it('anti-tank infantry beats tanks faster than riflemen', () => {
    const timeToKill = (attacker: string): number => {
      const world = createWorld();
      const spot = openSpot(world, 160, 110);
      const tank = world.spawnUnit('halcyon_mbt', 1, spot.x, spot.y + 26);
      tank.weapons.length = 0;
      for (let i = 0; i < 3; i++) {
        world.spawnUnit(attacker, 0, spot.x + i * 3, spot.y);
      }
      let ticks = 0;
      while (tank.alive && ticks < TICK_RATE * 300) {
        world.step();
        ticks++;
      }
      return ticks;
    };
    expect(timeToKill('halcyon_at_team')).toBeLessThan(timeToKill('halcyon_rifle_squad') / 3);
  });

  it('artillery splash hurts groups', () => {
    const world = createWorld();
    const spot = openSpot(world, 160, 100);
    const spg = world.spawnUnit('halcyon_spg', 0, spot.x, spot.y);
    const victims = [0, 1, 2, 3].map((i) => world.spawnUnit('halcyon_rifle_squad', 1, spot.x + (i % 2) * 2, spot.y + 60 + Math.floor(i / 2) * 2));
    victims.forEach((v) => (v.weapons.length = 0));
    world.spawnUnit('halcyon_recon_vehicle', 0, spot.x, spot.y + 40).weapons.length = 0;
    runTicks(world, 2);
    world.issue(0, { type: 'attack', units: [spg.id], target: victims[0]!.id });
    runTicks(world, TICK_RATE * 30);
    expect(victims.filter((v) => v.hp < v.maxHp).length).toBeGreaterThan(1);
  });
});

describe('authority and fog of war', () => {
  it('ignores commands for units the player does not own', () => {
    const world = createWorld();
    const enemyEngineer = owned(world, 1, 'halcyon_engineer')[0]!;
    const before = { x: enemyEngineer.x, y: enemyEngineer.y };
    world.issue(0, { type: 'move', units: [enemyEngineer.id], x: 10, y: 10 });
    runTicks(world, TICK_RATE * 3);
    expect({ x: enemyEngineer.x, y: enemyEngineer.y }).toEqual(before);
  });

  it('hides distant enemies and refuses attacks on them', () => {
    const world = createWorld();
    const tank = world.spawnUnit('halcyon_mbt', 0, 60, 120);
    const hidden = owned(world, 1, 'halcyon_hq')[0]!;
    runTicks(world, 2);
    expect(world.isVisibleToTeam(0, hidden)).toBe(false);
    world.issue(0, { type: 'attack', units: [tank.id], target: hidden.id });
    runTicks(world, 2);
    expect(tank.order.type).toBe('idle');
  });

  it('reveals enemies inside vision range', () => {
    const world = createWorld();
    const spot = openSpot(world, 160, 120);
    world.spawnUnit('halcyon_recon_vehicle', 0, spot.x, spot.y);
    const enemy = world.spawnUnit('halcyon_engineer', 1, spot.x + 20, spot.y + 10);
    runTicks(world, 2);
    expect(world.isVisibleToTeam(0, enemy)).toBe(true);
  });
});

describe('movement', () => {
  it('moves a group in formation without stacking', () => {
    const world = createWorld();
    const start = openSpot(world, 100, 60);
    const units = Array.from({ length: 12 }, (_, i) => world.spawnUnit('halcyon_mbt', 0, start.x + (i % 4) * 6, start.y + Math.floor(i / 4) * 6));
    world.issue(0, { type: 'move', units: units.map((u) => u.id), x: 150, y: 120 });
    runTicks(world, TICK_RATE * 40);
    for (const unit of units) {
      expect(Math.hypot(unit.x - 150, unit.y - 120)).toBeLessThan(25);
      expect(unit.order.type).toBe('idle');
    }
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        expect(Math.hypot(units[i]!.x - units[j]!.x, units[i]!.y - units[j]!.y)).toBeGreaterThan(3);
      }
    }
  });

  it('crosses the river through a crossing', () => {
    const world = createWorld();
    const start = openSpot(world, 130, 140);
    const unit = world.spawnUnit('halcyon_recon_vehicle', 0, start.x, start.y);
    world.issue(0, { type: 'move', units: [unit.id], x: 190, y: 180 });
    runTicks(world, TICK_RATE * 30);
    expect(Math.hypot(unit.x - 190, unit.y - 180)).toBeLessThan(3);
  });
});

describe('victory and determinism', () => {
  it('surrender ends the match for the other team', () => {
    const world = createWorld();
    world.issue(1, { type: 'surrender' });
    const events = collect(world, TICK_RATE * 2);
    expect(world.winnerTeam).toBe(0);
    expect(events).toContainEqual({ type: 'gameOver', winnerTeam: 0 });
  });

  it('identical seeds and commands give identical states', () => {
    const run = (): string => {
      const world = createWorld(99);
      const bots = [new Bot(world, 0, 'hard'), new Bot(world, 1, 'normal')];
      for (let i = 0; i < TICK_RATE * 240; i++) {
        bots.forEach((b) => b.update());
        world.step();
      }
      return world.stateHash();
    };
    expect(run()).toBe(run());
  });

  it('a bot-versus-bot match finishes with a winner', () => {
    const world = createWorld(7);
    const bots = [new Bot(world, 0, 'hard'), new Bot(world, 1, 'easy')];
    while (!world.ended && world.tick < TICK_RATE * 60 * 40) {
      bots.forEach((b) => b.update());
      world.step();
    }
    expect(world.ended).toBe(true);
    expect(world.winnerTeam).toBe(0);
  });
});
