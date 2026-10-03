import * as THREE from 'three';
import { snapFootprint, type BuildingDef, type Terrain } from '@conflict/shared';
import type { ClientEntity, ClientWorld } from '../game/clientWorld';
import type { RtsCamera } from '../input/rtsCamera';
import { groundHeight } from './bridge';
import { BuildingRenderer } from './buildingRenderer';
import { Effects } from './effects';
import { buildEnvironment } from './environment';
import { FogOfWarTexture } from './fogOfWar';
import { InstancedPool } from './instancedPool';
import { buildBuildingModels } from './models/buildings';
import type { QualityProfile } from './quality';
import { buildTerrainMesh } from './terrainMesh';
import { UnitRenderer } from './unitRenderer';

export interface OverlayState {
  selection: ReadonlySet<number>;
  hoverId: number;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  showAllHealth: boolean;
}

export interface PlacementPreview {
  def: BuildingDef;
  x: number;
  y: number;
  rotated: boolean;
  valid: boolean;
}

const SKY = 0xa9b9c4;
const SELECT_OWN = new THREE.Color(0x5df2a0);
const SELECT_ENEMY = new THREE.Color(0xff5a4a);
const SELECT_NEUTRAL = new THREE.Color(0xf2d35d);

/**
 * Owns the Three.js renderer and scene and draws one frame of the battlefield from the client world:
 * terrain, environment, structures, instanced units, effects, selection rings, placement ghost, and a 2D
 * overlay (health bars, veterancy, selection box) drawn on a separate canvas.
 */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly fow: FogOfWarTexture;
  readonly effects: Effects;
  readonly units: UnitRenderer;
  readonly buildings: BuildingRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly rings: InstancedPool;
  private readonly overlay: CanvasRenderingContext2D;
  private readonly ghostGroup = new THREE.Group();
  private readonly ghostMaterial: THREE.MeshBasicMaterial;
  private readonly ghostModels = buildBuildingModels();
  private ghostKey = '';
  private readonly matrix = new THREE.Matrix4();
  private readonly projected = new THREE.Vector3();
  private lastFogVersion = -1;
  private width = 1;
  private height = 1;
  private water: THREE.Object3D | undefined;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly overlayCanvas: HTMLCanvasElement,
    private readonly terrain: Terrain,
    private readonly quality: QualityProfile,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 260, 720);

    const map = terrain.map;
    this.fow = new FogOfWarTexture(Math.ceil(map.width / 4), Math.ceil(map.height / 4), map.width, map.height);

    const hemisphere = new THREE.HemisphereLight(0xcfe0ee, 0x5d5140, 1.25);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(hemisphere, this.sun, this.sun.target);

    this.scene.add(buildTerrainMesh(terrain, quality.terrainCellSize, this.fow));
    const environment = buildEnvironment(terrain, this.fow, quality.vegetationDensity);
    this.water = environment.getObjectByName('water');
    this.scene.add(environment);

    this.units = new UnitRenderer(this.scene, terrain, this.fow);
    this.buildings = new BuildingRenderer(this.scene, terrain, this.fow);
    this.effects = new Effects(this.scene, terrain, quality.maxParticles, quality.explosionLights);

    const ring = new THREE.RingGeometry(0.86, 1, 40);
    ring.rotateX(-Math.PI / 2);
    this.rings = new InstancedPool(
      this.scene,
      ring,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
      true,
      false,
    );
    this.ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x5df2a0, transparent: true, opacity: 0.45, depthWrite: false });
    this.scene.add(this.ghostGroup);

    this.overlay = overlayCanvas.getContext('2d')!;
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }

  resize(width: number, height: number, camera: RtsCamera): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlayCanvas.width = Math.round(width * dpr);
    this.overlayCanvas.height = Math.round(height * dpr);
    this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.resize(width, height);
    this.effects.setViewport(height * this.quality.pixelRatio, camera.camera.fov);
  }

  setFogEnabled(enabled: boolean): void {
    this.fow.setEnabled(enabled);
  }

  setPlacement(preview: PlacementPreview | null): void {
    if (!preview) {
      this.ghostGroup.visible = false;
      return;
    }
    const key = preview.def.model;
    if (key !== this.ghostKey) {
      this.ghostGroup.clear();
      const model = this.ghostModels.get(key);
      if (model) {
        this.ghostGroup.add(new THREE.Mesh(model.body, this.ghostMaterial), new THREE.Mesh(model.team, this.ghostMaterial));
      }
      const footprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.ghostMaterial);
      footprint.name = 'footprint';
      this.ghostGroup.add(footprint);
      this.ghostKey = key;
    }
    const snapped = snapFootprint(preview.def, preview.x, preview.y, preview.rotated);
    let base = -Infinity;
    for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]] as const) {
      base = Math.max(base, this.terrain.heightAt(snapped.x + dx * snapped.width, snapped.y + dy * snapped.depth));
    }
    this.ghostGroup.visible = true;
    this.ghostGroup.position.set(snapped.x, base + 0.05, -snapped.y);
    this.ghostGroup.rotation.y = preview.rotated ? Math.PI / 2 : 0;
    const footprint = this.ghostGroup.getObjectByName('footprint');
    footprint?.scale.set(preview.def.width, 1, preview.def.depth);
    this.ghostMaterial.color.set(preview.valid ? 0x5df2a0 : 0xff5a4a);
  }

  render(world: ClientWorld, camera: RtsCamera, overlay: OverlayState, time: number, dt: number): void {
    if (world.fogVersion !== this.lastFogVersion) {
      this.fow.update(world.fog);
      this.lastFogVersion = world.fogVersion;
    }
    this.updateSun(camera);
    const units: ClientEntity[] = [];
    const others: ClientEntity[] = [];
    for (const entity of world.entities.values()) {
      (entity.kind === 'unit' ? units : others).push(entity);
    }
    this.units.update(units, time);
    this.buildings.update(others, time);
    this.updateRings(world, overlay);
    this.emitAmbient(world, units, others, dt);
    this.effects.update(dt);
    if (this.water) {
      const ripple = this.water.userData['ripple'] as THREE.Texture | undefined;
      if (ripple) {
        ripple.offset.set(time * 0.01, time * 0.006);
      }
    }
    this.renderer.render(this.scene, camera.camera);
    this.drawOverlay(world, camera, overlay);
  }

  /** Screen position of a world point (sim coordinates + height), or null if behind the camera. */
  project(camera: RtsCamera, x: number, y: number, height: number): { x: number; y: number } | null {
    this.projected.set(x, height, -y).project(camera.camera);
    if (this.projected.z > 1) {
      return null;
    }
    return { x: ((this.projected.x + 1) / 2) * this.width, y: ((1 - this.projected.y) / 2) * this.height };
  }

  private updateSun(camera: RtsCamera): void {
    const span = Math.min(150, camera.visibleGroundHeight() * 0.9 + 30);
    const fx = camera.focusX;
    const fz = -camera.focusY;
    this.sun.position.set(fx + 70, 120, fz + 50);
    this.sun.target.position.set(fx, 0, fz);
    const shadow = this.sun.shadow.camera;
    shadow.left = -span;
    shadow.right = span;
    shadow.top = span;
    shadow.bottom = -span;
    shadow.near = 10;
    shadow.far = 400;
    shadow.updateProjectionMatrix();
  }

  private updateRings(world: ClientWorld, overlay: OverlayState): void {
    this.rings.begin();
    const draw = (entity: ClientEntity, color: THREE.Color): void => {
      const radius = entity.kind === 'building' ? Math.max(entity.buildingDef?.width ?? 8, entity.buildingDef?.depth ?? 8) * 0.75 : (this.units.modelFor(entity)?.selectionRadius ?? 2.5);
      const h = groundHeight(this.terrain, entity.x, entity.y) + 0.12;
      this.matrix.makeScale(radius, 1, radius).setPosition(entity.x, h, -entity.y);
      this.rings.push(this.matrix, color);
    };
    for (const id of overlay.selection) {
      const entity = world.entities.get(id);
      if (entity) {
        draw(entity, SELECT_OWN);
      }
    }
    const hover = world.entities.get(overlay.hoverId);
    if (hover && !overlay.selection.has(hover.id)) {
      draw(hover, world.isEnemy(hover.owner) ? SELECT_ENEMY : hover.owner < 0 ? SELECT_NEUTRAL : SELECT_OWN);
    }
    this.rings.end();
  }

  /** Dust behind moving vehicles and smoke from damaged structures. */
  private emitAmbient(world: ClientWorld, units: ClientEntity[], others: ClientEntity[], dt: number): void {
    for (const unit of units) {
      if ((unit.flags & 1) !== 0 && unit.unitDef && unit.unitDef.movement.locomotor !== 'Foot' && Math.random() < dt * 4) {
        const back = this.projected.set(unit.x - Math.cos(unit.heading) * 2.5, groundHeight(this.terrain, unit.x, unit.y), -(unit.y - Math.sin(unit.heading) * 2.5));
        this.effects.dust(back);
      }
    }
    for (const entity of others) {
      if (entity.kind === 'building' && !entity.ghost && entity.health < 0.5 && world.isVisible(entity.x, entity.y)) {
        const top = this.buildings.heightOf(entity) * 0.7;
        this.effects.damageSmoke(this.projected.set(entity.x, groundHeight(this.terrain, entity.x, entity.y) + top, -entity.y), entity.health, dt);
      }
    }
  }

  private drawOverlay(world: ClientWorld, camera: RtsCamera, overlay: OverlayState): void {
    const ctx = this.overlay;
    ctx.clearRect(0, 0, this.width, this.height);
    for (const entity of world.entities.values()) {
      if (entity.kind === 'resource' || entity.ghost) {
        continue;
      }
      const selected = overlay.selection.has(entity.id);
      const hovered = overlay.hoverId === entity.id;
      if (!selected && !hovered && !(overlay.showAllHealth || entity.health < 0.999)) {
        continue;
      }
      const top = entity.kind === 'building' ? this.buildings.heightOf(entity) + 1.5 : entity.unitDef?.movement.locomotor === 'Foot' ? 3.2 : 4.2;
      const screen = this.project(camera, entity.x, entity.y, groundHeight(this.terrain, entity.x, entity.y) + top);
      if (!screen || screen.x < -50 || screen.y < -50 || screen.x > this.width + 50 || screen.y > this.height + 50) {
        continue;
      }
      const width = entity.kind === 'building' ? 54 : 30;
      const x = screen.x - width / 2;
      const y = screen.y;
      ctx.fillStyle = 'rgba(8,12,14,0.75)';
      ctx.fillRect(x - 1, y - 1, width + 2, 6);
      ctx.fillStyle = entity.health > 0.6 ? '#4fe08a' : entity.health > 0.3 ? '#f2c84b' : '#ff5a4a';
      ctx.fillRect(x, y, width * entity.health, 4);
      if (entity.kind === 'building' && (entity.flags & 2) === 0) {
        ctx.fillStyle = '#d6a12b';
        ctx.fillRect(x, y + 6, width * entity.progress, 3);
      }
      if (entity.veterancy > 0) {
        ctx.fillStyle = '#f2d35d';
        for (let i = 0; i < entity.veterancy; i++) {
          const cx = x + width + 4 + i * 6;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + 2.5, y + 4);
          ctx.lineTo(cx + 5, y);
          ctx.lineTo(cx + 5, y + 2);
          ctx.lineTo(cx + 2.5, y + 6);
          ctx.lineTo(cx, y + 2);
          ctx.fill();
        }
      }
    }
    if (overlay.box) {
      const { x0, y0, x1, y1 } = overlay.box;
      ctx.strokeStyle = 'rgba(93,242,160,0.95)';
      ctx.fillStyle = 'rgba(93,242,160,0.12)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  dispose(): void {
    this.buildings.dispose();
    this.renderer.dispose();
  }
}
