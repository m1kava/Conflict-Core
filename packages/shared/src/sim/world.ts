import { FOG_CELL_SIZE, NEUTRAL_OWNER, TICK_RATE } from '../constants';
import { RESOURCE_DEF_ID, secondsToTicks, type GameData } from '../data/gameData';
import type { BuildingDef, UnitDef, VeterancyLevelDef, WeaponMountDef } from '../data/types';
import { distance } from '../math/geometry';
import { Rng } from '../math/random';
import type { MapDef } from '../map/mapDef';
import { Terrain } from '../map/terrain';
import { updateCombat, updateProjectiles, type Projectile } from './combat';
import type { Command } from './commands';
import { updateEconomy, updatePower } from './economy';
import { createEntity, type Entity, type Order } from './entity';
import type { NoticeCode, SimEvent } from './events';
import { moveUnits, processPathRequests } from './movement';
import { NavGrid } from './navigation';
import { MAX_BUILD_SLOPE, snapFootprint, SUPPLY_FIELD_CLEARANCE } from './placement';
import { applyCommand, updateOrders } from './orders';
import { SpatialGrid } from './spatial';
import { updateVictory } from './victory';
import { updateVisibility } from './visibility';

export interface PlayerSetup {
  slot: number;
  team: number;
  faction: string;
  name: string;
}

export interface PlayerStats {
  unitsProduced: number;
  unitsLost: number;
  unitsKilled: number;
  structuresBuilt: number;
  structuresLost: number;
  creditsEarned: number;
  creditsSpent: number;
}

export interface PlayerState {
  slot: number;
  team: number;
  faction: string;
  name: string;
  credits: number;
  powerProduced: number;
  powerUsed: number;
  lowPower: boolean;
  hasRadar: boolean;
  defeated: boolean;
  stats: PlayerStats;
}

export interface WorldOptions {
  map: MapDef;
  data: GameData;
  players: PlayerSetup[];
  seed: number;
}

const SELL_REFUND = 0.5;

/**
 * The authoritative match simulation. Deterministic for a given seed and command stream: fixed tick,
 * seeded RNG, insertion-ordered iteration, no wall-clock access. Runs on the server (and in tests/bots);
 * clients only ever see filtered snapshots of it.
 */
export class World {
  readonly map: MapDef;
  readonly data: GameData;
  readonly terrain: Terrain;
  readonly nav: NavGrid;
  readonly spatial: SpatialGrid;
  readonly rng: Rng;
  readonly players: PlayerState[];
  readonly entities = new Map<number, Entity>();
  readonly projectiles: Projectile[] = [];
  readonly pathQueue: number[] = [];
  readonly fogWidth: number;
  readonly fogHeight: number;
  /** Per team: 1 where currently visible. */
  readonly visibility = new Map<number, Uint8Array>();

  tick = 0;
  winnerTeam: number | null = null;
  events: SimEvent[] = [];

  private nextId = 1;
  private readonly pending: { player: number; command: Command }[] = [];

  constructor(options: WorldOptions) {
    this.map = options.map;
    this.data = options.data;
    this.terrain = new Terrain(options.map);
    this.nav = new NavGrid(this.terrain);
    this.spatial = new SpatialGrid(options.map.width, options.map.height);
    this.rng = new Rng(options.seed);
    this.fogWidth = Math.ceil(options.map.width / FOG_CELL_SIZE);
    this.fogHeight = Math.ceil(options.map.height / FOG_CELL_SIZE);

    if (options.players.length > options.map.spawns.length) {
      throw new Error(`Map ${options.map.id} supports at most ${options.map.spawns.length} players.`);
    }
    this.players = options.players.map((setup) => {
      const faction = this.data.factions.get(setup.faction);
      if (!faction || !faction.playable) {
        throw new Error(`Faction '${setup.faction}' is not playable.`);
      }
      return {
        ...setup,
        credits: faction.startingCredits,
        powerProduced: 0,
        powerUsed: 0,
        lowPower: false,
        hasRadar: false,
        defeated: false,
        stats: { unitsProduced: 0, unitsLost: 0, unitsKilled: 0, structuresBuilt: 0, structuresLost: 0, creditsEarned: 0, creditsSpent: 0 },
      };
    });
    for (const player of this.players) {
      if (!this.visibility.has(player.team)) {
        this.visibility.set(player.team, new Uint8Array(this.fogWidth * this.fogHeight));
      }
    }
    this.setupMap();
  }

  get ended(): boolean {
    return this.winnerTeam !== null;
  }

  /** Queues a validated-shape command; it is applied at the start of the next tick. */
  issue(player: number, command: Command): void {
    if (this.player(player) && !this.ended) {
      this.pending.push({ player, command });
    }
  }

  /** Advances one fixed tick and returns the events it produced. */
  step(): SimEvent[] {
    this.events = [];
    if (this.ended) {
      return this.events;
    }
    for (const { player, command } of this.pending) {
      if (!this.player(player)?.defeated) {
        applyCommand(this, player, command);
      }
    }
    this.pending.length = 0;

    this.spatial.rebuild(this.entities.values());
    updatePower(this);
    updateOrders(this);
    processPathRequests(this);
    moveUnits(this);
    this.spatial.rebuild(this.entities.values());
    updateCombat(this);
    updateProjectiles(this);
    updateEconomy(this);
    if (this.tick % 2 === 0) {
      updateVisibility(this);
    }
    this.removeDead();
    updateVictory(this);
    this.tick++;
    return this.events;
  }

  player(slot: number): PlayerState | undefined {
    return this.players[slot];
  }

  get seconds(): number {
    return this.tick / TICK_RATE;
  }

  // ---------------------------------------------------------------- spawning

  spawnUnit(defId: string, owner: number, x: number, y: number, heading = 0): Entity {
    const def = this.data.unit(defId);
    const entity = createEntity(this.nextId++, 'unit', defId, owner, this.player(owner)?.team ?? -1, x, y);
    entity.unitDef = def;
    entity.heading = heading;
    entity.maxHp = def.health;
    entity.hp = def.health;
    entity.radius = def.movement.radius;
    entity.armorType = def.armorType;
    entity.visionRadius = def.visionRadius;
    entity.cost = def.cost;
    entity.weapons = this.createWeapons(def.weapons, heading);
    this.entities.set(entity.id, entity);
    return entity;
  }

  spawnBuilding(defId: string, owner: number, x: number, y: number, rotated: boolean, complete: boolean): Entity {
    const def = this.data.building(defId);
    const snapped = this.snapFootprint(def, x, y, rotated);
    const entity = createEntity(this.nextId++, 'building', defId, owner, this.player(owner)?.team ?? -1, snapped.x, snapped.y);
    entity.buildingDef = def;
    entity.rotated = rotated;
    // Buildings never turn; the heading only encodes the 90° placement rotation for clients.
    entity.heading = rotated ? Math.PI / 2 : 0;
    entity.maxHp = def.health;
    entity.hp = complete ? def.health : Math.max(1, def.health * 0.1);
    entity.radius = Math.max(def.width, def.depth) / 2;
    entity.armorType = def.armorType;
    entity.visionRadius = def.visionRadius;
    entity.cost = def.cost;
    entity.complete = complete;
    entity.constructionProgress = complete ? 1 : 0;
    entity.weapons = this.createWeapons(def.weapons ?? [], 0);
    entity.cells = this.footprintCells(def, snapped.x, snapped.y, rotated) ?? [];
    entity.rallyX = snapped.x;
    entity.rallyY = snapped.y - (rotated ? def.width : def.depth) / 2 - 6;
    this.nav.occupy(entity.cells);
    this.entities.set(entity.id, entity);
    return entity;
  }

  spawnResource(x: number, y: number, amount: number): Entity {
    const entity = createEntity(this.nextId++, 'resource', RESOURCE_DEF_ID, NEUTRAL_OWNER, -1, x, y);
    entity.supply = amount;
    entity.radius = 4;
    // Resources cannot be damaged; maxHp records the initial supply so clients can show depletion.
    entity.hp = amount;
    entity.maxHp = amount;
    this.entities.set(entity.id, entity);
    return entity;
  }

  private createWeapons(mounts: WeaponMountDef[], heading: number): Entity['weapons'] {
    return mounts.map((mount) => ({
      def: this.data.weapon(mount.weapon),
      mount,
      cooldown: 0,
      burstRemaining: 0,
      burstTimer: 0,
      turretYaw: heading,
    }));
  }

  // ---------------------------------------------------------------- placement

  /** Snaps a structure centre so its footprint aligns with navigation cells. */
  snapFootprint(def: BuildingDef, x: number, y: number, rotated: boolean): { x: number; y: number } {
    const footprint = snapFootprint(def, x, y, rotated);
    return { x: footprint.x, y: footprint.y };
  }

  footprintCells(def: BuildingDef, x: number, y: number, rotated: boolean): number[] | null {
    const footprint = snapFootprint(def, x, y, rotated);
    const cells: number[] = [];
    for (let cy = footprint.cellY; cy < footprint.cellY + footprint.cellsDeep; cy++) {
      for (let cx = footprint.cellX; cx < footprint.cellX + footprint.cellsWide; cx++) {
        if (!this.nav.inBounds(cx, cy)) {
          return null;
        }
        cells.push(cy * this.nav.width + cx);
      }
    }
    return cells;
  }

  /** Why a structure cannot be placed here, or null if placement is valid. */
  placementProblem(owner: number, defId: string, x: number, y: number, rotated: boolean, ignoreUnitId = 0): NoticeCode | null {
    const def = this.data.buildings.get(defId);
    const player = this.player(owner);
    if (!def || !player || def.faction !== player.faction || !def.buildable) {
      return 'cannotBuildThere';
    }
    if (!this.hasPrerequisites(owner, def.prerequisites)) {
      return 'requirementsMissing';
    }
    const snapped = this.snapFootprint(def, x, y, rotated);
    const cells = this.footprintCells(def, snapped.x, snapped.y, rotated);
    if (!cells) {
      return 'cannotBuildThere';
    }
    for (const cell of cells) {
      const cx = cell % this.nav.width;
      const cy = Math.floor(cell / this.nav.width);
      if (this.terrain.isTerrainBlocked(cx, cy) || this.nav.isOccupied(cx, cy)) {
        return 'cannotBuildThere';
      }
      if (this.terrain.slopeAt(this.nav.cellCenter(cx), this.nav.cellCenter(cy)) > MAX_BUILD_SLOPE) {
        return 'cannotBuildThere';
      }
    }
    const halfW = (rotated ? def.depth : def.width) / 2;
    const halfD = (rotated ? def.width : def.depth) / 2;
    const faction = this.data.factions.get(player.faction)!;
    let inRadius = false;
    let blockedByUnit = false;
    for (const entity of this.entities.values()) {
      if (!entity.alive) {
        continue;
      }
      if (entity.kind === 'resource' && distance(entity.x, entity.y, snapped.x, snapped.y) < SUPPLY_FIELD_CLEARANCE + Math.max(halfW, halfD)) {
        return 'cannotBuildThere';
      }
      if (entity.kind === 'building' && entity.owner === owner && distance(entity.x, entity.y, snapped.x, snapped.y) <= faction.buildRadius + entity.radius) {
        inRadius = true;
      }
      if (
        entity.kind === 'unit' &&
        entity.id !== ignoreUnitId &&
        entity.owner !== owner &&
        Math.abs(entity.x - snapped.x) < halfW + entity.radius &&
        Math.abs(entity.y - snapped.y) < halfD + entity.radius
      ) {
        blockedByUnit = true;
      }
    }
    if (!inRadius || blockedByUnit) {
      return 'cannotBuildThere';
    }
    return null;
  }

  hasPrerequisites(owner: number, prerequisites: readonly string[]): boolean {
    return prerequisites.every((required) => {
      for (const entity of this.entities.values()) {
        if (entity.alive && entity.owner === owner && entity.defId === required && entity.complete) {
          return true;
        }
      }
      return false;
    });
  }

  // ---------------------------------------------------------------- economy helpers

  trySpend(owner: number, amount: number): boolean {
    const player = this.player(owner);
    if (!player || player.credits < amount) {
      return false;
    }
    player.credits -= amount;
    player.stats.creditsSpent += amount;
    return true;
  }

  refund(owner: number, amount: number): void {
    const player = this.player(owner);
    if (player) {
      player.credits += amount;
      player.stats.creditsSpent -= amount;
    }
  }

  sell(building: Entity): void {
    const refund = Math.floor(building.cost * SELL_REFUND * (building.hp / building.maxHp) * building.constructionProgress);
    for (const item of building.queue) {
      this.refund(building.owner, item.cost);
    }
    building.queue.length = 0;
    const player = this.player(building.owner);
    if (player) {
      player.credits += refund;
    }
    this.kill(building, null);
  }

  // ---------------------------------------------------------------- combat helpers

  /** Applies damage, credits the attacker with experience on a kill. */
  damage(target: Entity, amount: number, attacker: Entity | null): void {
    if (!target.alive || target.kind === 'resource' || amount <= 0) {
      return;
    }
    target.hp -= amount;
    if (target.lastDamagedTick < this.tick - TICK_RATE * 15 && target.owner >= 0) {
      this.notice(target.owner, 'underAttack', target.x, target.y);
    }
    target.lastDamagedTick = this.tick;
    if (target.hp <= 0) {
      if (attacker && attacker.alive && attacker.owner !== target.owner) {
        const value = target.cost * (target.unitDef?.experienceValue ?? 1);
        this.grantExperience(attacker, value);
        const attackerPlayer = this.player(attacker.owner);
        if (attackerPlayer) {
          attackerPlayer.stats.unitsKilled++;
        }
      }
      this.kill(target, attacker);
    }
  }

  kill(entity: Entity, _killer: Entity | null): void {
    if (!entity.alive) {
      return;
    }
    entity.alive = false;
    entity.hp = 0;
    if (entity.kind === 'building') {
      this.nav.release(entity.cells);
      const player = this.player(entity.owner);
      if (player) {
        player.stats.structuresLost++;
        this.notice(entity.owner, 'buildingLost', entity.x, entity.y);
      }
    } else if (entity.kind === 'unit') {
      const player = this.player(entity.owner);
      if (player) {
        player.stats.unitsLost++;
      }
    }
    if (entity.kind !== 'resource') {
      this.events.push({ type: 'death', id: entity.id, defId: entity.defId, owner: entity.owner, x: entity.x, y: entity.y, kind: entity.kind });
    }
  }

  grantExperience(entity: Entity, amount: number): void {
    if (entity.kind !== 'unit' || entity.cost <= 0) {
      return;
    }
    entity.xp += amount;
    const levels = this.data.veterancy;
    let level = entity.veterancy;
    while (level + 1 < levels.length && entity.xp >= levels[level + 1]!.experienceRequired * entity.cost) {
      level++;
    }
    if (level !== entity.veterancy) {
      const newMultiplier = levels[level]?.healthMultiplier ?? 1;
      const baseHealth = entity.unitDef?.health ?? entity.maxHp;
      const ratio = entity.hp / entity.maxHp;
      entity.maxHp = baseHealth * newMultiplier;
      entity.hp = entity.maxHp * ratio;
      entity.veterancy = level;
      this.events.push({ type: 'promoted', id: entity.id, owner: entity.owner, level });
    }
  }

  veterancyLevel(entity: Entity): VeterancyLevelDef {
    return this.data.veterancy[entity.veterancy] ?? this.data.veterancy[0]!;
  }

  // ---------------------------------------------------------------- visibility

  fogIndex(x: number, y: number): number {
    const fx = Math.min(this.fogWidth - 1, Math.max(0, Math.floor(x / FOG_CELL_SIZE)));
    const fy = Math.min(this.fogHeight - 1, Math.max(0, Math.floor(y / FOG_CELL_SIZE)));
    return fy * this.fogWidth + fx;
  }

  /** Whether a team currently sees an entity (own and allied entities are always visible). */
  isVisibleToTeam(team: number, entity: Entity): boolean {
    if (entity.team === team || entity.kind === 'resource') {
      return true;
    }
    const grid = this.visibility.get(team);
    if (!grid) {
      return false;
    }
    if (grid[this.fogIndex(entity.x, entity.y)] === 1) {
      return true;
    }
    if (entity.kind === 'building') {
      const r = entity.radius * 0.9;
      return (
        grid[this.fogIndex(entity.x - r, entity.y - r)] === 1 ||
        grid[this.fogIndex(entity.x + r, entity.y - r)] === 1 ||
        grid[this.fogIndex(entity.x - r, entity.y + r)] === 1 ||
        grid[this.fogIndex(entity.x + r, entity.y + r)] === 1
      );
    }
    return false;
  }

  isPointVisibleToTeam(team: number, x: number, y: number): boolean {
    return this.visibility.get(team)?.[this.fogIndex(x, y)] === 1;
  }

  // ---------------------------------------------------------------- orders & misc

  /** Replaces (or appends to) a unit's orders. */
  giveOrder(unit: Entity, order: Order, queue: boolean): void {
    if (queue && unit.order.type !== 'idle') {
      unit.orderQueue.push(order);
      return;
    }
    unit.orderQueue.length = 0;
    this.startOrder(unit, order);
  }

  startOrder(unit: Entity, order: Order): void {
    unit.order = order;
    unit.targetId = order.type === 'attack' ? order.targetId : 0;
    unit.path = [];
    unit.pathIndex = 0;
    unit.stuckTicks = 0;
    unit.lastProgressDistance = Infinity;
    if (order.type === 'hold' || order.type === 'guard' || order.type === 'idle') {
      unit.guardX = unit.x;
      unit.guardY = unit.y;
    }
    if (order.type === 'harvest') {
      unit.harvestPhase = unit.cargo > 0 ? 'toDepot' : 'toField';
    }
  }

  /** Advances to the next queued order, or idles. */
  completeOrder(unit: Entity): void {
    const next = unit.orderQueue.shift();
    this.startOrder(unit, next ?? { type: 'idle', x: unit.x, y: unit.y, targetId: 0 });
    unit.moving = false;
  }

  requestPath(unit: Entity, x: number, y: number): void {
    unit.pathGoalX = x;
    unit.pathGoalY = y;
    if (!unit.pathPending) {
      unit.pathPending = true;
      this.pathQueue.push(unit.id);
    }
  }

  notice(player: number, code: NoticeCode, x?: number, y?: number): void {
    this.events.push(x === undefined || y === undefined ? { type: 'notice', player, code } : { type: 'notice', player, code, x, y });
  }

  unitDef(entity: Entity): UnitDef | undefined {
    return entity.unitDef;
  }

  ticks(seconds: number): number {
    return secondsToTicks(seconds);
  }

  /**
   * Checksum of gameplay state (positions quantised to 1 mm). Used by determinism tests and, later, replay
   * verification: the same seed and command stream must always produce the same hash.
   */
  stateHash(): string {
    let h1 = 0x811c9dc5 ^ this.tick;
    let h2 = 0x01000193;
    const mix = (value: number): void => {
      const v = Math.round(value * 1000) | 0;
      h1 = Math.imul(h1 ^ v, 16777619);
      h2 = Math.imul(h2 ^ (v >>> 3), 2246822519);
    };
    for (const entity of this.entities.values()) {
      mix(entity.id);
      mix(entity.x);
      mix(entity.y);
      mix(entity.hp);
      mix(entity.heading);
      mix(entity.supply);
    }
    for (const player of this.players) {
      mix(player.credits);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  private removeDead(): void {
    for (const [id, entity] of this.entities) {
      if (!entity.alive) {
        this.entities.delete(id);
      }
    }
  }

  private setupMap(): void {
    for (const field of this.map.supplyFields) {
      this.spawnResource(field.x, field.y, field.amount);
    }
    for (const player of this.players) {
      const spawn = this.map.spawns[player.slot];
      if (!spawn) {
        throw new Error(`No spawn for slot ${player.slot}.`);
      }
      const faction = this.data.factions.get(player.faction)!;
      const hq = this.spawnBuilding(faction.startingBuilding, player.slot, spawn.x, spawn.y, false, true);
      const forwardX = Math.cos(spawn.facing);
      const forwardY = Math.sin(spawn.facing);
      hq.rallyX = hq.x + forwardX * (hq.radius + 8);
      hq.rallyY = hq.y + forwardY * (hq.radius + 8);
      faction.startingUnits.forEach((unitId, index) => {
        const offset = hq.radius + 5 + index * 3;
        const unit = this.spawnUnit(unitId, player.slot, hq.x + forwardX * offset, hq.y + forwardY * offset, spawn.facing);
        unit.guardX = unit.x;
        unit.guardY = unit.y;
      });
    }
    updatePower(this);
    updateVisibility(this);
  }
}
