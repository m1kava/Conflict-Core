import * as THREE from 'three';
import {
  decodeEvents,
  type BuildingDef,
  type Command,
  type DecodedSnapshot,
  type MatchPlayerView,
  type NoticeCode,
  type PrivateStateView,
  type SimEvent,
} from '@conflict/shared';
import type { SoundEngine, SoundKind } from '../audio/sound';
import { InputController, type InputTarget } from '../input/inputController';
import { RtsCamera } from '../input/rtsCamera';
import type { Connection } from '../net/connection';
import { groundHeight } from '../render/bridge';
import { qualityProfile } from '../render/quality';
import { SceneRenderer } from '../render/sceneRenderer';
import { Hud, type CommandButton, type HudView } from '../ui/hud';
import { ClientWorld, isComplete, type ClientEntity } from './clientWorld';
import { canPlace, hasPrerequisites } from './placement';
import type { Settings } from './settings';

type Mode = 'normal' | 'attackMove' | 'place' | 'rally';

const STRUCTURE_HOTKEYS: Record<string, string> = { power_plant: 'P', supply_depot: 'D', barracks: 'B', vehicle_plant: 'V', guard_tower: 'T', radar_uplink: 'R' };
const MARKER_MOVE = new THREE.Color(0x5df2a0);
const MARKER_ATTACK = new THREE.Color(0xff5a4a);
const MARKER_SPECIAL = new THREE.Color(0xf2b84b);
const HUD_INTERVAL_MS = 120;
const MINIMAP_INTERVAL_MS = 200;

const NOTICES: Record<NoticeCode, { text: string; kind: 'info' | 'ok' | 'warn' | 'danger'; sound?: SoundKind; ping?: boolean }> = {
  insufficientFunds: { text: 'Insufficient funds', kind: 'warn', sound: 'error' },
  cannotBuildThere: { text: 'Cannot build there', kind: 'warn', sound: 'error' },
  requirementsMissing: { text: 'Requirements not met', kind: 'warn', sound: 'error' },
  queueFull: { text: 'Production queue full', kind: 'warn', sound: 'error' },
  lowPower: { text: 'Low power — build more Power Plants', kind: 'danger', sound: 'alert' },
  underAttack: { text: 'We are under attack', kind: 'danger', sound: 'alert', ping: true },
  unitReady: { text: 'Unit ready', kind: 'ok', sound: 'ready' },
  constructionComplete: { text: 'Construction complete', kind: 'ok', sound: 'build' },
  buildingLost: { text: 'Structure lost', kind: 'danger', sound: 'alert', ping: true },
  unitLost: { text: 'Unit lost', kind: 'danger' },
  supplyDepleted: { text: 'Supply field depleted', kind: 'warn' },
};

export interface GameCallbacks {
  openMenu(): void;
}

/**
 * Runs one match on the client: applies server snapshots/events to the ClientWorld, renders the scene,
 * turns input into selection and commands, and keeps the HUD current. Holds no authority — every action
 * becomes a command the server may accept or reject.
 */
export class GameController implements InputTarget {
  readonly world: ClientWorld;
  readonly camera: RtsCamera;
  private readonly scene: SceneRenderer;
  private readonly input: InputController;
  private readonly hud: Hud;
  private readonly selection = new Set<number>();
  private readonly groups = new Map<number, number[]>();
  private readonly touchDevice = matchMedia('(pointer: coarse)').matches;
  private mode: Mode = 'normal';
  private placement: { def: BuildingDef; x: number; y: number; rotated: boolean; valid: boolean } | null = null;
  private hoverId = 0;
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private frame = 0;
  private lastFrame = performance.now();
  private lastHud = 0;
  private lastMinimap = 0;
  private lastHover = 0;
  private lastGroupKey = { digit: -1, time: 0 };
  private fps = 60;
  private bytesWindow = { time: performance.now(), bytes: 0, rate: 0 };
  private width = 1;
  private height = 1;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlay: HTMLCanvasElement,
    uiRoot: HTMLElement,
    private readonly connection: Connection,
    private readonly sound: SoundEngine,
    private settings: Settings,
    start: { mapId: string; slot: number; players: MatchPlayerView[]; tickRate: number; tick: number },
    private readonly callbacks: GameCallbacks,
  ) {
    this.world = new ClientWorld(start.mapId, start.slot, start.players, start.tickRate, start.tick);
    const spawn = this.world.terrain.map.spawns[start.slot] ?? { x: 160, y: 160, facing: 0 };
    // Face the map centre: yaw 0 looks north, so derive yaw from the direction toward the middle.
    const map = this.world.terrain.map;
    const yaw = Math.atan2(map.width / 2 - spawn.x, map.height / 2 - spawn.y);
    this.camera = new RtsCamera(this.world.terrain, spawn.x + Math.sin(yaw) * 18, spawn.y + Math.cos(yaw) * 18, yaw);
    this.applyCameraSettings();
    this.scene = new SceneRenderer(canvas, overlay, this.world.terrain, qualityProfile(settings.quality));
    this.hud = new Hud(uiRoot, this.world.terrain, {
      openMenu: () => this.callbacks.openMenu(),
      selectArmy: () => this.selectArmy(),
      deselect: () => this.clearSelection(),
      toggleAttackMove: () => this.setMode(this.mode === 'attackMove' ? 'normal' : 'attackMove'),
      rotatePlacement: () => this.rotatePlacement(),
      confirmPlacement: () => this.confirmPlacement(),
      cancelMode: () => this.setMode('normal'),
      selectEntity: (id) => this.selectOnlyType(id),
      jump: (x, y) => this.camera.jumpTo(x, y),
      command: (x, y) => this.commandAtGround(x, y, false),
    });
    this.input = new InputController(canvas, this);
    this.input.edgeScroll = settings.edgeScroll;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    if (new URLSearchParams(location.search).has('debug')) {
      this.exposeDebugHooks();
    }
    requestAnimationFrame(() => this.loop());
  }

  /**
   * Read-only hooks for automated browser tests (enabled with ?debug). They only expose what this client
   * already knows; there is nothing here a player could use to affect the authoritative match.
   */
  private exposeDebugHooks(): void {
    (window as unknown as Record<string, unknown>)['__conflict'] = {
      entities: () =>
        [...this.world.entities.values()].map((e) => {
          const screen = this.scene.project(this.camera, e.x, e.y, groundHeight(this.world.terrain, e.x, e.y) + 1);
          return { id: e.id, defId: e.defId, owner: e.owner, x: e.x, y: e.y, health: e.health, progress: e.progress, flags: e.flags, screen };
        }),
      slot: this.world.slot,
      privateState: () => this.world.privateState,
      selection: () => [...this.selection],
      focus: (x: number, y: number) => this.camera.jumpTo(x, y),
      screenOf: (x: number, y: number) => this.scene.project(this.camera, x, y, groundHeight(this.world.terrain, x, y)),
      groundAt: (sx: number, sy: number) => this.camera.screenToGround(sx, sy, this.width, this.height),
      camera: () => ({ x: this.camera.focusX, y: this.camera.focusY, yaw: this.camera.yaw }),
      frame: () => this.frame,
    };
  }

  // ------------------------------------------------------------------ network

  onSnapshot(snapshot: DecodedSnapshot): void {
    this.world.applySnapshot(snapshot, performance.now());
  }

  onEvents(tick: number, events: unknown[]): void {
    this.world.applyEvents(tick, decodeEvents(this.world.data, events));
  }

  onPrivate(state: PrivateStateView): void {
    this.world.applyPrivate(state);
    this.connection.acknowledge(state.lastCommandSeq);
  }

  onResync(): void {
    this.world.resetForResync();
    this.connection.resendUnacknowledged();
  }

  onPlayerStatus(slot: number, connected: boolean, graceSeconds?: number): void {
    const player = this.world.players.find((p) => p.slot === slot);
    if (!player || slot === this.world.slot) {
      return;
    }
    this.hud.setBanner(connected ? null : `${player.name} disconnected — waiting up to ${graceSeconds ?? 90}s for them to return`);
    if (connected) {
      this.hud.toast(`${player.name} reconnected`, 'ok');
    }
  }

  setConnectionState(state: string): void {
    if (state === 'reconnecting') {
      this.hud.setBanner('Connection lost — reconnecting…');
    } else if (state === 'online') {
      this.hud.setBanner(null);
    }
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.applyCameraSettings();
    this.input.edgeScroll = settings.edgeScroll;
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.hud.dispose();
    this.scene.dispose();
  }

  // ------------------------------------------------------------------ frame loop

  private loop(): void {
    if (this.disposed) {
      return;
    }
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.frame++;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;

    const due = this.world.update(now);
    for (const item of due) {
      this.playEvent(item.event);
    }
    this.pruneSelection();
    this.input.update(dt);
    this.camera.update(dt);
    if (this.placement) {
      this.placement.valid = canPlace(this.world, this.placement.def, this.placement.x, this.placement.y, this.placement.rotated);
    }
    this.scene.setPlacement(this.placement);
    this.scene.render(this.world, this.camera, { selection: this.selection, hoverId: this.hoverId, box: this.box, showAllHealth: this.settings.showAllHealthBars }, now / 1000, dt);

    if (now - this.lastHud > HUD_INTERVAL_MS) {
      this.lastHud = now;
      this.hud.update(this.hudView());
      this.hud.setConnection(this.connection.state, this.connection.rttMs);
      this.updatePerformance(now);
    }
    if (now - this.lastMinimap > MINIMAP_INTERVAL_MS) {
      this.lastMinimap = now;
      this.hud.minimap.draw(this.world, this.world.privateState?.hasRadar ?? false, this.camera.viewCorners(this.width, this.height));
    }
  }

  private resize(): void {
    this.width = this.canvas.clientWidth || window.innerWidth;
    this.height = this.canvas.clientHeight || window.innerHeight;
    this.scene.resize(this.width, this.height, this.camera);
  }

  private applyCameraSettings(): void {
    this.camera.sensitivity = this.settings.cameraSensitivity;
    this.camera.rotationEnabled = this.settings.cameraRotation;
    this.sound.setVolume(this.settings.volume);
  }

  private updatePerformance(now: number): void {
    const elapsed = now - this.bytesWindow.time;
    if (elapsed > 1000) {
      this.bytesWindow.rate = ((this.connection.bytesIn - this.bytesWindow.bytes) / elapsed) * 1000;
      this.bytesWindow = { time: now, bytes: this.connection.bytesIn, rate: this.bytesWindow.rate };
    }
    if (!this.settings.showPerformance) {
      this.hud.setPerformance(null);
      return;
    }
    const info = this.scene.info;
    this.hud.setPerformance(
      [
        `FPS        ${this.fps.toFixed(0)}`,
        `Draw calls ${info.render.calls}`,
        `Triangles  ${(info.render.triangles / 1000).toFixed(0)}k`,
        `Entities   ${this.world.entities.size}`,
        `Particles  ${this.scene.effects.activeParticles}`,
        `Ping       ${Math.round(this.connection.rttMs)} ms`,
        `Tick       ${this.world.latestTick} (render ${this.world.renderTick.toFixed(1)})`,
        `Download   ${(this.bytesWindow.rate / 1024).toFixed(1)} KB/s`,
      ].join('\n'),
    );
  }

  // ------------------------------------------------------------------ events → effects

  private muzzleHeight(entity: ClientEntity | undefined): number {
    if (!entity) return 1.8;
    if (entity.kind === 'building') return 5.5;
    return entity.unitDef?.movement.locomotor === 'Foot' ? 1.6 : 2.2;
  }

  private worldPoint(x: number, y: number, lift: number): THREE.Vector3 {
    return new THREE.Vector3(x, groundHeight(this.world.terrain, x, y) + lift, -y);
  }

  private distanceToCamera(x: number, y: number): number {
    return Math.hypot(x - this.camera.focusX, y - this.camera.focusY);
  }

  private playEvent(event: SimEvent): void {
    const effects = this.scene.effects;
    switch (event.type) {
      case 'fire': {
        const weapon = this.world.data.weapons.get(event.weapon);
        if (!weapon) return;
        const shooter = this.world.entities.get(event.shooter);
        const target = this.world.entities.get(event.target);
        const from = this.worldPoint(event.x, event.y, this.muzzleHeight(shooter));
        const to = this.worldPoint(event.tx, event.ty, target?.kind === 'building' ? 3 : 1);
        effects.weaponFired(weapon, from, to, event.flight / 15, event.hit);
        this.sound.play(weapon.presentation.muzzle, this.distanceToCamera(event.x, event.y));
        if (weapon.delivery === 'Hitscan' && (weapon.burstCount ?? 1) > 1) {
          // Repeat the report for the rest of the burst (the sound engine throttles rapid repeats).
          for (let i = 1; i < (weapon.burstCount ?? 1); i++) {
            window.setTimeout(() => this.sound.play(weapon.presentation.muzzle, this.distanceToCamera(event.x, event.y)), i * (weapon.burstInterval ?? 0.1) * 1000);
          }
        }
        return;
      }
      case 'impact': {
        const weapon = this.world.data.weapons.get(event.weapon);
        if (!weapon) return;
        effects.impact(this.worldPoint(event.x, event.y, 0.3), weapon.presentation.impact);
        if (weapon.presentation.impact === 'medium' || weapon.presentation.impact === 'large') {
          this.sound.play(weapon.presentation.impact === 'large' ? 'explosionLarge' : 'explosionSmall', this.distanceToCamera(event.x, event.y));
        }
        return;
      }
      case 'death': {
        const at = this.worldPoint(event.x, event.y, 0.8);
        const distance = this.distanceToCamera(event.x, event.y);
        if (event.kind === 'building') {
          const def = this.world.data.buildings.get(event.defId);
          effects.structureDestroyed(at, Math.max(def?.width ?? 8, def?.depth ?? 8));
          this.sound.play('explosionLarge', distance);
        } else if (this.world.data.units.get(event.defId)?.movement.locomotor === 'Foot') {
          effects.infantryKilled(at);
        } else {
          effects.vehicleDestroyed(at);
          this.sound.play('explosionLarge', distance);
        }
        return;
      }
      case 'notice': {
        const notice = NOTICES[event.code];
        this.hud.toast(notice.text, notice.kind, event.code === 'underAttack' ? 10000 : 2500);
        if (notice.sound) this.sound.play(notice.sound);
        if (notice.ping && event.x !== undefined && event.y !== undefined) this.hud.minimap.ping(event.x, event.y);
        return;
      }
      case 'promoted':
        this.hud.toast('Unit promoted', 'ok', 4000);
        return;
      case 'defeated': {
        const player = this.world.players.find((p) => p.slot === event.player);
        if (player) this.hud.toast(`${player.name} has been defeated`, event.player === this.world.slot ? 'danger' : 'ok', 0);
        return;
      }
      default:
        return;
    }
  }

  // ------------------------------------------------------------------ InputTarget

  viewport(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  userGesture(): void {
    this.sound.unlock();
  }

  setBox(box: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.box = box;
  }

  hover(x: number, y: number): void {
    const now = performance.now();
    if (this.mode === 'place' && this.placement) {
      const ground = this.camera.screenToGround(x, y, this.width, this.height);
      if (ground) {
        this.placement.x = ground.x;
        this.placement.y = ground.y;
      }
      return;
    }
    if (now - this.lastHover < 50) {
      return;
    }
    this.lastHover = now;
    this.hoverId = this.pick(x, y)?.id ?? 0;
    this.canvas.style.cursor = this.mode === 'attackMove' || this.mode === 'rally' ? 'crosshair' : this.hoverId ? 'pointer' : 'default';
  }

  primaryAt(x: number, y: number, options: { additive: boolean; touch: boolean }): void {
    const ground = this.camera.screenToGround(x, y, this.width, this.height);
    switch (this.mode) {
      case 'place':
        if (ground && this.placement) {
          this.placement.x = ground.x;
          this.placement.y = ground.y;
          if (!options.touch) {
            this.confirmPlacement();
          }
        }
        return;
      case 'attackMove':
        if (ground) this.issueGroupMove('attackMove', ground.x, ground.y, options.additive);
        this.setMode('normal');
        return;
      case 'rally':
        if (ground) this.setRally(ground.x, ground.y);
        this.setMode('normal');
        return;
    }
    const picked = this.pick(x, y);
    if (!options.touch) {
      this.select(picked, options.additive);
      return;
    }
    // Touch: one tap both selects and commands, depending on what is under the finger.
    if (picked && picked.owner === this.world.slot && !picked.ghost) {
      if (picked.kind === 'building' && this.ownSelectedUnits().some((u) => u.unitDef?.canConstruct) && (!isComplete(picked) || picked.health < 1)) {
        this.contextOn(picked, false);
        return;
      }
      this.select(picked, false);
      return;
    }
    if (this.ownSelectedUnits().length > 0) {
      if (picked && this.contextOn(picked, false)) {
        return;
      }
      if (ground) this.commandAtGround(ground.x, ground.y, false);
      return;
    }
    this.select(picked, false);
  }

  contextAt(x: number, y: number, queue: boolean): void {
    if (this.mode !== 'normal') {
      this.setMode('normal');
      return;
    }
    const picked = this.pick(x, y);
    if (picked && this.contextOn(picked, queue)) {
      return;
    }
    const ground = this.camera.screenToGround(x, y, this.width, this.height);
    if (ground) {
      if (this.selectedProducers().length > 0 && this.ownSelectedUnits().length === 0) {
        this.setRally(ground.x, ground.y);
        return;
      }
      this.commandAtGround(ground.x, ground.y, queue);
    }
  }

  holdRelease(x: number, y: number): void {
    const ground = this.camera.screenToGround(x, y, this.width, this.height);
    if (ground && this.ownSelectedUnits().length > 0) {
      this.issueGroupMove('attackMove', ground.x, ground.y, false);
    }
  }

  selectSameType(x: number, y: number): void {
    const picked = this.pick(x, y);
    if (!picked || picked.owner !== this.world.slot) {
      return;
    }
    this.selection.clear();
    for (const entity of this.world.entities.values()) {
      if (entity.defId === picked.defId && entity.owner === this.world.slot && !entity.ghost && this.onScreen(entity)) {
        this.selection.add(entity.id);
      }
    }
    this.sound.play('click');
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void {
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const top = Math.min(y0, y1);
    const bottom = Math.max(y0, y1);
    const inside: number[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.kind !== 'unit' || entity.owner !== this.world.slot) continue;
      const screen = this.scene.project(this.camera, entity.x, entity.y, groundHeight(this.world.terrain, entity.x, entity.y) + 1);
      if (screen && screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom) {
        inside.push(entity.id);
      }
    }
    if (!additive) {
      this.selection.clear();
    }
    inside.forEach((id) => this.selection.add(id));
    if (inside.length) this.sound.play('click');
  }

  key(event: KeyboardEvent): boolean {
    const code = event.code;
    if (code === 'Escape') {
      if (this.mode !== 'normal') this.setMode('normal');
      else if (this.selection.size > 0) this.clearSelection();
      else this.callbacks.openMenu();
      return true;
    }
    if (code === 'F3') {
      this.settings.showPerformance = !this.settings.showPerformance;
      return true;
    }
    if (code === 'Home' || code === 'Space') {
      const hq = this.world.ownEntities().find((e) => e.kind === 'building');
      if (hq) this.camera.jumpTo(hq.x, hq.y);
      return true;
    }
    const digit = /^Digit([0-9])$/.exec(code)?.[1];
    if (digit !== undefined) {
      this.handleGroupKey(Number(digit), event.ctrlKey || event.metaKey);
      return true;
    }
    if (this.mode === 'place' && code === 'KeyR' && !event.ctrlKey) {
      this.rotatePlacement();
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const letter = /^Key([A-Z])$/.exec(code)?.[1];
    if (!letter) {
      return false;
    }
    if (event.shiftKey === false && letter === 'A' && this.ownSelectedUnits().length > 0) {
      this.setMode('attackMove');
      return true;
    }
    const command = this.commandButtons().find((c) => c.hotkey === letter && !c.disabled);
    if (command) {
      command.onClick();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ selection & commands

  private pick(x: number, y: number): ClientEntity | undefined {
    const ground = this.camera.screenToGround(x, y, this.width, this.height);
    const pixelsPerMetre = this.height / Math.max(1, this.camera.visibleGroundHeight());
    let best: ClientEntity | undefined;
    let bestScore = Infinity;
    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'unit') {
        const screen = this.scene.project(this.camera, entity.x, entity.y, groundHeight(this.world.terrain, entity.x, entity.y) + 1.2);
        if (!screen) continue;
        const radius = Math.max(16, (this.scene.units.modelFor(entity)?.selectionRadius ?? 2.5) * pixelsPerMetre);
        const d = Math.hypot(screen.x - x, screen.y - y);
        if (d < radius && d < bestScore) {
          best = entity;
          bestScore = d;
        }
      } else if (ground) {
        const def = entity.buildingDef;
        let inside: boolean;
        if (def) {
          const rotated = Math.abs(Math.sin(entity.heading)) > 0.5;
          const hw = (rotated ? def.depth : def.width) / 2;
          const hd = (rotated ? def.width : def.depth) / 2;
          inside = Math.abs(ground.x - entity.x) <= hw && Math.abs(ground.y - entity.y) <= hd;
        } else {
          inside = Math.hypot(ground.x - entity.x, ground.y - entity.y) < 5;
        }
        // Units standing in front of a structure win over the structure.
        if (inside && bestScore === Infinity) {
          best = entity;
          bestScore = 1000;
        }
      }
    }
    return best;
  }

  private select(entity: ClientEntity | undefined, additive: boolean): void {
    if (!additive) {
      this.selection.clear();
    }
    if (entity) {
      if (additive && this.selection.has(entity.id)) {
        this.selection.delete(entity.id);
      } else {
        // Only own entities can be multi-selected; enemies and neutrals are inspected one at a time.
        if (entity.owner !== this.world.slot) this.selection.clear();
        this.selection.add(entity.id);
      }
      this.sound.play('click');
    }
  }

  private selectOnlyType(id: number): void {
    const entity = this.world.entities.get(id);
    if (!entity) return;
    for (const other of [...this.selection]) {
      if (this.world.entities.get(other)?.defId !== entity.defId) this.selection.delete(other);
    }
  }

  private clearSelection(): void {
    this.selection.clear();
    this.setMode('normal');
  }

  private selectArmy(): void {
    this.selection.clear();
    for (const entity of this.world.entities.values()) {
      if (entity.kind === 'unit' && entity.owner === this.world.slot && (entity.unitDef?.weapons.length ?? 0) > 0) {
        this.selection.add(entity.id);
      }
    }
    this.sound.play('click');
  }

  private pruneSelection(): void {
    for (const id of this.selection) {
      const entity = this.world.entities.get(id);
      if (!entity || (entity.ghost && entity.owner === this.world.slot)) this.selection.delete(id);
    }
  }

  private selectedEntities(): ClientEntity[] {
    return [...this.selection].map((id) => this.world.entities.get(id)).filter((e): e is ClientEntity => e !== undefined);
  }

  private ownSelectedUnits(): ClientEntity[] {
    return this.selectedEntities().filter((e) => e.kind === 'unit' && e.owner === this.world.slot);
  }

  private selectedProducers(): ClientEntity[] {
    return this.selectedEntities().filter((e) => e.kind === 'building' && e.owner === this.world.slot && (e.buildingDef?.produces.length ?? 0) > 0);
  }

  private send(command: Command): void {
    this.connection.command(command);
  }

  /** Context order on an entity. Returns true if an order was issued. */
  private contextOn(target: ClientEntity, queue: boolean): boolean {
    const units = this.ownSelectedUnits();
    if (units.length === 0) return false;
    const ids = (filter: (u: ClientEntity) => boolean): number[] => units.filter(filter).map((u) => u.id);
    if (this.world.isEnemy(target.owner) && !target.ghost) {
      const armed = ids((u) => (u.unitDef?.weapons.length ?? 0) > 0);
      if (armed.length === 0) return false;
      this.send({ type: 'attack', units: armed, target: target.id, queue });
      this.scene.effects.orderMarker(this.worldPoint(target.x, target.y, 0), MARKER_ATTACK);
      this.sound.play('confirm');
      return true;
    }
    if (target.kind === 'resource') {
      const trucks = ids((u) => u.unitDef?.class === 'Harvester');
      if (trucks.length === 0) return false;
      this.send({ type: 'harvest', units: trucks, target: target.id });
      this.scene.effects.orderMarker(this.worldPoint(target.x, target.y, 0), MARKER_SPECIAL);
      this.sound.play('confirm');
      return true;
    }
    if (target.kind === 'building' && target.owner === this.world.slot && (!isComplete(target) || target.health < 1)) {
      const builders = ids((u) => u.unitDef?.canConstruct === true);
      if (builders.length === 0) return false;
      this.send({ type: 'repair', units: builders, target: target.id });
      this.scene.effects.orderMarker(this.worldPoint(target.x, target.y, 0), MARKER_SPECIAL);
      this.sound.play('confirm');
      return true;
    }
    return false;
  }

  private commandAtGround(x: number, y: number, queue: boolean): void {
    if (this.ownSelectedUnits().length === 0) {
      if (this.selectedProducers().length > 0) this.setRally(x, y);
      return;
    }
    this.issueGroupMove('move', x, y, queue);
  }

  private issueGroupMove(type: 'move' | 'attackMove', x: number, y: number, queue: boolean): void {
    const units = this.ownSelectedUnits().map((u) => u.id);
    if (units.length === 0) return;
    for (let i = 0; i < units.length; i += 200) {
      this.send({ type, units: units.slice(i, i + 200), x, y, queue });
    }
    this.scene.effects.orderMarker(this.worldPoint(x, y, 0), type === 'move' ? MARKER_MOVE : MARKER_SPECIAL);
    this.sound.play('confirm');
  }

  private setRally(x: number, y: number): void {
    for (const building of this.selectedProducers()) {
      this.send({ type: 'rally', building: building.id, x, y });
    }
    this.scene.effects.orderMarker(this.worldPoint(x, y, 0), MARKER_SPECIAL);
    this.sound.play('confirm');
  }

  private handleGroupKey(digit: number, assign: boolean): void {
    if (assign) {
      this.groups.set(digit, this.ownSelectedUnits().map((u) => u.id));
      this.hud.toast(`Group ${digit} assigned`, 'info', 0);
      return;
    }
    const ids = (this.groups.get(digit) ?? []).filter((id) => this.world.entities.has(id));
    if (ids.length === 0) return;
    const now = performance.now();
    if (this.lastGroupKey.digit === digit && now - this.lastGroupKey.time < 350) {
      const first = this.world.entities.get(ids[0]!);
      if (first) this.camera.jumpTo(first.x, first.y);
    }
    this.lastGroupKey = { digit, time: now };
    this.selection.clear();
    ids.forEach((id) => this.selection.add(id));
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    if (mode !== 'place') {
      this.placement = null;
    }
    this.hud.setPlacementMode(mode === 'place', this.touchDevice);
    this.hud.setAttackMove(mode === 'attackMove');
    this.canvas.style.cursor = mode === 'attackMove' || mode === 'rally' ? 'crosshair' : 'default';
  }

  private startPlacement(def: BuildingDef): void {
    this.setMode('place');
    this.placement = { def, x: this.camera.focusX, y: this.camera.focusY, rotated: false, valid: false };
  }

  private rotatePlacement(): void {
    if (this.placement) this.placement.rotated = !this.placement.rotated;
  }

  private confirmPlacement(): void {
    const placement = this.placement;
    if (!placement) return;
    const builders = this.ownSelectedUnits().filter((u) => u.unitDef?.canConstruct).map((u) => u.id);
    if (builders.length === 0) {
      this.hud.toast('Select an engineer to build', 'warn');
      this.setMode('normal');
      return;
    }
    // Re-check now: the pointer may have moved since the last frame computed the preview.
    placement.valid = canPlace(this.world, placement.def, placement.x, placement.y, placement.rotated);
    if (!placement.valid) {
      this.hud.toast('Cannot build there', 'warn');
      this.sound.play('error');
      return;
    }
    this.send({ type: 'build', units: builders, building: placement.def.id, x: placement.x, y: placement.y, rotated: placement.rotated });
    this.scene.effects.orderMarker(this.worldPoint(placement.x, placement.y, 0), MARKER_SPECIAL);
    this.sound.play('build');
    this.setMode('normal');
  }

  // ------------------------------------------------------------------ HUD view

  private hudView(): HudView {
    const state = this.world.privateState;
    const selection = this.selectedEntities();
    const single = selection.length === 1 ? selection[0] : undefined;
    const queue =
      single && single.kind === 'building' && single.owner === this.world.slot
        ? (state?.queues[single.id] ?? []).map((item, index) => ({
            unitId: item.unitId,
            model: this.world.data.units.get(item.unitId)?.model ?? 'build',
            progress: item.progress,
            onCancel: () => this.send({ type: 'cancel', building: single.id, index }),
          }))
        : [];
    return {
      credits: state?.credits ?? 0,
      powerProduced: state?.powerProduced ?? 0,
      powerUsed: state?.powerUsed ?? 0,
      lowPower: state?.lowPower ?? false,
      time: this.world.renderTick / 15,
      selection,
      selectionIsOwn: selection.every((e) => e.owner === this.world.slot),
      commands: this.commandButtons(),
      queue,
    };
  }

  private commandButtons(): CommandButton[] {
    const selection = this.selectedEntities().filter((e) => e.owner === this.world.slot && !e.ghost);
    if (selection.length === 0) return [];
    const credits = this.world.privateState?.credits ?? 0;
    const buttons: CommandButton[] = [];
    const units = selection.filter((e) => e.kind === 'unit');

    if (units.some((u) => u.unitDef?.canConstruct)) {
      for (const def of this.world.data.buildings.values()) {
        if (!def.buildable || def.faction !== 'halcyon') continue;
        const locked = hasPrerequisites(this.world, def.prerequisites) ? undefined : def.prerequisites.map((p) => this.world.data.buildings.get(p)?.displayName ?? p).join(', ');
        buttons.push({
          key: `build:${def.id}`,
          icon: def.model,
          label: def.displayName,
          cost: def.cost,
          ...(STRUCTURE_HOTKEYS[def.model] ? { hotkey: STRUCTURE_HOTKEYS[def.model]! } : {}),
          disabled: locked !== undefined || credits < def.cost,
          ...(locked ? { locked } : {}),
          active: this.placement?.def.id === def.id,
          onClick: () => this.startPlacement(def),
        });
      }
    }

    if (units.length > 0) {
      buttons.push(
        { key: 'stop', icon: 'stop', label: 'Stop', hotkey: 'S', onClick: () => this.unitOrder('stop') },
        { key: 'hold', icon: 'hold', label: 'Hold', hotkey: 'H', onClick: () => this.unitOrder('hold') },
      );
      if (units.some((u) => (u.unitDef?.weapons.length ?? 0) > 0)) {
        buttons.push(
          { key: 'guard', icon: 'guard', label: 'Guard', hotkey: 'G', onClick: () => this.unitOrder('guard') },
          { key: 'attackMove', icon: 'attackMove', label: 'Attack-move', active: this.mode === 'attackMove', onClick: () => this.setMode(this.mode === 'attackMove' ? 'normal' : 'attackMove') },
        );
      }
      return buttons;
    }

    const building = selection.length === 1 && selection[0]!.kind === 'building' ? selection[0]! : undefined;
    if (!building || !building.buildingDef) return buttons;
    const def = building.buildingDef;
    const queue = this.world.privateState?.queues[building.id] ?? [];
    if (isComplete(building)) {
      for (const unitId of def.produces) {
        const unit = this.world.data.units.get(unitId);
        if (!unit) continue;
        const locked = hasPrerequisites(this.world, unit.prerequisites) ? undefined : unit.prerequisites.map((p) => this.world.data.buildings.get(p)?.displayName ?? p).join(', ');
        const queued = queue.filter((q) => q.unitId === unitId);
        buttons.push({
          key: `produce:${unitId}`,
          icon: unit.model,
          label: unit.displayName,
          cost: unit.cost,
          ...(unit.hotkey ? { hotkey: unit.hotkey } : {}),
          disabled: locked !== undefined || credits < unit.cost,
          ...(locked ? { locked } : {}),
          count: queued.length,
          progress: queue[0]?.unitId === unitId ? queue[0].progress : 0,
          onClick: () => this.send({ type: 'produce', building: building.id, unit: unitId }),
        });
      }
      if (def.produces.length > 0) {
        buttons.push({ key: 'rally', icon: 'rally', label: 'Rally point', active: this.mode === 'rally', onClick: () => this.setMode('rally') });
      }
    }
    if (def.buildable) {
      buttons.push({
        key: 'sell',
        icon: 'sell',
        label: 'Sell',
        onClick: () => {
          if (window.confirm(`Sell ${def.displayName}?`)) this.send({ type: 'sell', building: building.id });
        },
      });
    }
    return buttons;
  }

  private unitOrder(type: 'stop' | 'hold' | 'guard'): void {
    const units = this.ownSelectedUnits().map((u) => u.id);
    if (units.length > 0) {
      this.send({ type, units });
      this.sound.play('confirm');
    }
  }

  private onScreen(entity: ClientEntity): boolean {
    const screen = this.scene.project(this.camera, entity.x, entity.y, groundHeight(this.world.terrain, entity.x, entity.y));
    return screen !== null && screen.x >= 0 && screen.y >= 0 && screen.x <= this.width && screen.y <= this.height;
  }
}
