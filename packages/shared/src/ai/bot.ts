import type { Command } from '../sim/commands';
import type { Entity } from '../sim/entity';
import type { World } from '../sim/world';

export type BotDifficulty = 'easy' | 'normal' | 'hard';

interface DifficultyProfile {
  /** Ticks between decisions (lower = faster reactions, tighter macro). */
  thinkInterval: number;
  firstWave: number;
  waveGrowth: number;
  trucksPerDepot: number;
  towers: number;
  /** Credits kept back before queueing army units (higher = slower army). */
  armyReserve: number;
}

const PROFILES: Record<BotDifficulty, DifficultyProfile> = {
  easy: { thinkInterval: 45, firstWave: 6, waveGrowth: 1, trucksPerDepot: 1, towers: 1, armyReserve: 1200 },
  normal: { thinkInterval: 20, firstWave: 9, waveGrowth: 2, trucksPerDepot: 2, towers: 1, armyReserve: 400 },
  hard: { thinkInterval: 8, firstWave: 10, waveGrowth: 3, trucksPerDepot: 3, towers: 1, armyReserve: 0 },
};

/** Desired structure order; each entry is built once its predecessors exist. */
const BUILD_ORDER = [
  'halcyon_supply_depot',
  'halcyon_power_plant',
  'halcyon_barracks',
  'halcyon_vehicle_plant',
  'halcyon_power_plant',
  'halcyon_radar_uplink',
  'halcyon_guard_tower',
  'halcyon_power_plant',
  'halcyon_vehicle_plant',
  'halcyon_guard_tower',
];

const POWER_PLANT = 'halcyon_power_plant';
const ARMY_CLASSES = new Set(['Infantry', 'LightVehicle', 'MainBattleTank', 'AntiAir', 'Artillery', 'HeavyVehicle', 'TankDestroyer']);

/**
 * Skirmish / test bot. It issues exactly the same commands a human client sends (through World.issue, which
 * goes through the same validation) and only reads its own entities plus what its team can currently see.
 */
export class Bot {
  private readonly profile: DifficultyProfile;
  private wave = 0;
  private lastDefenseTick = -1000;

  constructor(
    private readonly world: World,
    readonly slot: number,
    difficulty: BotDifficulty = 'normal',
  ) {
    this.profile = PROFILES[difficulty];
  }

  update(): void {
    const world = this.world;
    const player = world.player(this.slot);
    if (!player || player.defeated || world.ended || (world.tick + this.slot * 3) % this.profile.thinkInterval !== 0) {
      return;
    }
    const own = this.ownEntities();
    this.manageConstruction(own);
    this.manageProduction(own);
    this.manageArmy(own);
  }

  private issue(command: Command): void {
    this.world.issue(this.slot, command);
  }

  private ownEntities(): Entity[] {
    const result: Entity[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.alive && entity.owner === this.slot) {
        result.push(entity);
      }
    }
    return result;
  }

  // ------------------------------------------------------------ construction

  private manageConstruction(own: Entity[]): void {
    const world = this.world;
    const player = world.player(this.slot)!;
    const builders = own.filter((e) => e.kind === 'unit' && e.unitDef?.canConstruct);
    const idleBuilder = builders.find((b) => b.order.type === 'idle');

    // Finish abandoned construction sites first.
    const site = own.find((e) => e.kind === 'building' && !e.complete && !builders.some((b) => b.order.targetId === e.id));
    if (site && idleBuilder) {
      this.issue({ type: 'repair', units: [idleBuilder.id], target: site.id });
      return;
    }
    // Repair damaged structures when nothing is under construction.
    const damaged = own.find((e) => e.kind === 'building' && e.complete && e.hp < e.maxHp * 0.6 && world.tick - e.lastDamagedTick > 75);
    if (damaged && idleBuilder) {
      this.issue({ type: 'repair', units: [idleBuilder.id], target: damaged.id });
      return;
    }
    if (!idleBuilder || builders.some((b) => b.order.type === 'construct')) {
      return;
    }

    const next = this.nextStructure(own);
    if (!next) {
      return;
    }
    const def = world.data.building(next);
    if (player.credits < def.cost || !world.hasPrerequisites(this.slot, def.prerequisites)) {
      return;
    }
    const spot = this.findBuildSpot(own, next);
    if (spot) {
      this.issue({ type: 'build', units: [idleBuilder.id], building: next, x: spot.x, y: spot.y });
    }
  }

  private nextStructure(own: Entity[]): string | undefined {
    const player = this.world.player(this.slot)!;
    const powerMargin = player.powerProduced - player.powerUsed;
    const counts = new Map<string, number>();
    for (const e of own) {
      if (e.kind === 'building') {
        counts.set(e.defId, (counts.get(e.defId) ?? 0) + 1);
      }
    }
    const required = new Map<string, number>();
    for (const id of BUILD_ORDER) {
      required.set(id, (required.get(id) ?? 0) + 1);
      if ((counts.get(id) ?? 0) < (required.get(id) ?? 0)) {
        const def = this.world.data.building(id);
        if (id !== POWER_PLANT && def.power < 0 && powerMargin + def.power < 0) {
          return POWER_PLANT;
        }
        if (id === 'halcyon_guard_tower' && (counts.get(id) ?? 0) >= this.profile.towers) {
          continue;
        }
        return id;
      }
    }
    return powerMargin < 2 ? POWER_PLANT : undefined;
  }

  /** Deterministic spiral search around the HQ (or first structure) for a valid placement. */
  private findBuildSpot(own: Entity[], defId: string): { x: number; y: number } | undefined {
    const anchor = own.find((e) => e.kind === 'building' && e.buildingDef?.critical) ?? own.find((e) => e.kind === 'building');
    if (!anchor) {
      return undefined;
    }
    const spawn = this.world.map.spawns[this.slot]!;
    const towardCentre = Math.atan2(this.world.map.height / 2 - spawn.y, this.world.map.width / 2 - spawn.x);
    const isTower = defId === 'halcyon_guard_tower';
    for (let ring = isTower ? 3 : 1; ring <= 6; ring++) {
      const radius = 10 + ring * 7;
      const steps = 8 + ring * 4;
      for (let i = 0; i < steps; i++) {
        // Towers face the enemy; other structures prefer the back of the base.
        const spread = ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI * 2)) / steps;
        const angle = (isTower ? towardCentre : towardCentre + Math.PI) + spread;
        const x = anchor.x + Math.cos(angle) * radius;
        const y = anchor.y + Math.sin(angle) * radius;
        if (this.world.placementProblem(this.slot, defId, x, y, false) === null) {
          return { x, y };
        }
      }
    }
    return undefined;
  }

  // ------------------------------------------------------------ production

  private manageProduction(own: Entity[]): void {
    const world = this.world;
    const player = world.player(this.slot)!;
    const buildings = own.filter((e) => e.kind === 'building' && e.complete);
    const units = own.filter((e) => e.kind === 'unit');
    const builders = units.filter((u) => u.unitDef?.canConstruct).length;
    const trucks = units.filter((u) => u.unitDef?.class === 'Harvester').length;
    const depots = buildings.filter((b) => b.buildingDef?.supplyDropOff).length;
    const hasRadar = world.hasPrerequisites(this.slot, ['halcyon_radar_uplink']);

    for (const building of buildings) {
      if (building.queue.length >= 2) {
        continue;
      }
      const produces = building.buildingDef!.produces;
      let choice: string | undefined;
      if (produces.includes('halcyon_engineer') && builders < 2 && building.defId === 'halcyon_hq') {
        choice = 'halcyon_engineer';
      } else if (produces.includes('halcyon_supply_truck') && trucks < depots * this.profile.trucksPerDepot) {
        choice = 'halcyon_supply_truck';
      } else if (building.defId === 'halcyon_barracks' && player.credits >= 200 + this.profile.armyReserve) {
        choice = world.rng.chance(0.55) ? 'halcyon_rifle_squad' : 'halcyon_at_team';
      } else if (building.defId === 'halcyon_vehicle_plant' && player.credits >= 1100 + this.profile.armyReserve) {
        const roll = world.rng.next();
        choice = roll < 0.5 ? 'halcyon_mbt' : roll < 0.7 ? 'halcyon_recon_vehicle' : hasRadar ? (roll < 0.85 ? 'halcyon_spg' : 'halcyon_aa_vehicle') : 'halcyon_mbt';
      }
      if (choice && player.credits >= world.data.unit(choice).cost) {
        this.issue({ type: 'produce', building: building.id, unit: choice });
      }
    }
  }

  // ------------------------------------------------------------ army

  private manageArmy(own: Entity[]): void {
    const world = this.world;
    const army = own.filter((e) => e.kind === 'unit' && ARMY_CLASSES.has(e.unitDef!.class));
    const idle = army.filter((u) => u.order.type === 'idle');

    // Defend: anything hit recently near our structures pulls idle units.
    const attacked = own.find((e) => e.kind === 'building' && world.tick - e.lastDamagedTick < 30);
    if (attacked && idle.length > 0 && world.tick - this.lastDefenseTick > 45) {
      this.lastDefenseTick = world.tick;
      this.issue({ type: 'attackMove', units: idle.map((u) => u.id), x: attacked.x, y: attacked.y });
      return;
    }

    const waveSize = this.profile.firstWave + this.wave * this.profile.waveGrowth;
    if (idle.length >= waveSize) {
      const target = this.attackTarget();
      if (target) {
        this.wave++;
        this.issue({ type: 'attackMove', units: idle.map((u) => u.id), x: target.x, y: target.y, formation: 'auto' });
      }
    }
  }

  /** Visible enemy structure if any, otherwise the enemy's starting position (public map knowledge). */
  private attackTarget(): { x: number; y: number } | undefined {
    const world = this.world;
    const team = world.player(this.slot)!.team;
    for (const entity of world.entities.values()) {
      if (entity.alive && entity.kind === 'building' && entity.team !== team && entity.owner >= 0 && world.isVisibleToTeam(team, entity)) {
        return { x: entity.x, y: entity.y };
      }
    }
    const enemy = world.players.find((p) => p.team !== team && !p.defeated);
    return enemy ? world.map.spawns[enemy.slot] : undefined;
  }
}
