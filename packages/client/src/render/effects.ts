import * as THREE from 'three';
import type { Terrain, WeaponDef } from '@conflict/shared';
import { groundHeight } from './bridge';
import { ParticleLayer } from './particles';
import { radialTexture, scorchTexture, smokeTexture } from './textures';

interface Flight {
  kind: 'shell' | 'missile' | 'arc' | 'tracer';
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  duration: number;
  trailTimer: number;
}

interface Tracer {
  from: THREE.Vector3;
  to: THREE.Vector3;
  age: number;
  duration: number;
  color: THREE.Color;
}

interface Decal {
  age: number;
  size: number;
  x: number;
  y: number;
  z: number;
  rotation: number;
  kind: 'scorch' | 'marker';
  color: THREE.Color;
}

const C = (hex: number): THREE.Color => new THREE.Color(hex);
const FIRE = C(0xffc56a);
const FIRE_END = C(0xc2410c);
const FLASH = C(0xfff2c4);
const SMOKE_DARK = C(0x2f2b28);
const SMOKE_GREY = C(0x7a746c);
const DUST = C(0xa8977a);
const SPARK = C(0xffd27a);
const MISSILE_SMOKE = C(0xd8d4cc);
const TRACER = C(0xffd58a);
const WHITE = C(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
const MAX_TRACERS = 200;
const MAX_DECALS = 96;
const SCORCH_LIFETIME = 40;
const MARKER_LIFETIME = 0.7;

/**
 * Combat and ambient effects, all pooled: two particle layers (additive fire/flash, alpha smoke/dust), a
 * line-segment tracer pool, an instanced decal pool for scorch marks and order markers, and a few shared
 * point lights for large explosions. Effects are spawned only for events the server let this player see.
 */
export class Effects {
  private readonly fire: ParticleLayer;
  private readonly smoke: ParticleLayer;
  private readonly flights: Flight[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly tracerGeometry: THREE.BufferGeometry;
  private readonly tracerPositions: Float32Array;
  private readonly tracerColors: Float32Array;
  private readonly decals: Decal[] = [];
  private readonly scorchMesh: THREE.InstancedMesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly lights: { light: THREE.PointLight; age: number; duration: number; intensity: number }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly temp = new THREE.Vector3();
  private readonly decalPosition = new THREE.Vector3();
  private readonly decalScale = new THREE.Vector3();
  private readonly decalColor = new THREE.Color();
  private time = 0;
  private delayed: { at: number; run: () => void }[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
    maxParticles: number,
    explosionLights: boolean,
  ) {
    this.fire = new ParticleLayer(Math.round(maxParticles * 0.45), radialTexture(64, 0.1), true);
    this.smoke = new ParticleLayer(Math.round(maxParticles * 0.55), smokeTexture(128), false);
    scene.add(this.smoke.points, this.fire.points);

    this.tracerPositions = new Float32Array(MAX_TRACERS * 6);
    this.tracerColors = new Float32Array(MAX_TRACERS * 6);
    this.tracerGeometry = new THREE.BufferGeometry();
    this.tracerGeometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerGeometry.setAttribute('color', new THREE.BufferAttribute(this.tracerColors, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(
      this.tracerGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    scene.add(lines);

    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.scorchMesh = new THREE.InstancedMesh(
      plane,
      new THREE.MeshBasicMaterial({ map: scorchTexture(128), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      MAX_DECALS,
    );
    const ring = new THREE.RingGeometry(0.8, 1, 32);
    ring.rotateX(-Math.PI / 2);
    this.markerMesh = new THREE.InstancedMesh(
      ring,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
      MAX_DECALS,
    );
    for (const mesh of [this.scorchMesh, this.markerMesh]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 1;
      scene.add(mesh);
    }
    this.markerMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);

    if (explosionLights) {
      for (let i = 0; i < 4; i++) {
        const light = new THREE.PointLight(0xffa04a, 0, 30, 2);
        scene.add(light);
        this.lights.push({ light, age: 1, duration: 1, intensity: 0 });
      }
    }
  }

  get activeParticles(): number {
    return this.fire.active + this.smoke.active;
  }

  setViewport(height: number, fov: number): void {
    this.fire.setViewportScale(height, fov);
    this.smoke.setViewportScale(height, fov);
  }

  /**
   * Muzzle effects and projectile / tracer visuals for one shot. Hitscan bursts arrive as a single event and are
   * expanded here into `burstCount` shots spaced by `burstInterval`.
   */
  weaponFired(weapon: WeaponDef, from: THREE.Vector3, to: THREE.Vector3, flightSeconds: number, hit: boolean): void {
    this.singleShot(weapon, from, to, flightSeconds, hit);
    if (weapon.delivery === 'Hitscan') {
      for (let i = 1; i < (weapon.burstCount ?? 1); i++) {
        const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
        const shotFrom = from.clone();
        const shotTo = to.clone().add(jitter);
        this.delayed.push({ at: this.time + i * (weapon.burstInterval ?? 0.1), run: () => this.singleShot(weapon, shotFrom, shotTo, 0, hit) });
      }
    }
  }

  private singleShot(weapon: WeaponDef, from: THREE.Vector3, to: THREE.Vector3, flightSeconds: number, hit: boolean): void {
    const look = this.temp.subVectors(to, from).normalize();
    const p = weapon.presentation;
    const flashSize = p.muzzle === 'cannon' || p.muzzle === 'howitzer' ? 3.2 : p.muzzle === 'autocannon' ? 1.6 : p.muzzle === 'rifle' ? 0.7 : 1.8;
    this.fire.spawn({ x: from.x, y: from.y, z: from.z, life: 0.07, size: flashSize, endSize: flashSize * 0.6, color: FLASH, endColor: FIRE, alpha: 1 });
    if (p.muzzle === 'cannon' || p.muzzle === 'howitzer' || p.muzzle === 'missile' || p.muzzle === 'sam') {
      for (let i = 0; i < 5; i++) {
        this.smoke.spawn({
          x: from.x,
          y: from.y,
          z: from.z,
          vx: look.x * 4 + (Math.random() - 0.5) * 2,
          vy: 0.8 + Math.random(),
          vz: look.z * 4 + (Math.random() - 0.5) * 2,
          life: 1.2 + Math.random(),
          size: 1.2,
          endSize: 4,
          color: SMOKE_GREY,
          alpha: 0.45,
          drag: 1.5,
        });
      }
    }
    switch (p.projectile) {
      case 'tracer':
        this.tracers.push({ from: from.clone(), to: to.clone(), age: 0, duration: Math.max(0.05, from.distanceTo(to) / 260), color: TRACER });
        break;
      case 'shell':
      case 'missile':
      case 'arc':
        this.flights.push({ kind: p.projectile, from: from.clone(), to: to.clone(), start: this.time, duration: Math.max(0.05, flightSeconds), trailTimer: 0 });
        break;
    }
    if (weapon.delivery === 'Hitscan') {
      this.impact(to, hit ? p.impact : 'bullet');
    }
  }

  impact(at: THREE.Vector3, kind: string): void {
    switch (kind) {
      case 'bullet':
        for (let i = 0; i < 2; i++) {
          this.smoke.spawn({ x: at.x, y: at.y + 0.2, z: at.z, vy: 1.5, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, life: 0.5, size: 0.5, endSize: 1.4, color: DUST, alpha: 0.5 });
        }
        this.fire.spawn({ x: at.x, y: at.y + 0.3, z: at.z, life: 0.05, size: 0.5, color: SPARK });
        return;
      case 'small':
        this.burst(at, 0.6, 4);
        return;
      case 'medium':
        this.explosion(at, 1.4, false);
        return;
      case 'large':
        this.explosion(at, 2.6, true);
        return;
      case 'air':
        this.burst(at, 1.0, 6);
        return;
    }
  }

  /** Fireball, smoke column, sparks and an optional scorch decal. */
  explosion(at: THREE.Vector3, scale: number, scorch: boolean): void {
    for (let i = 0; i < 6 + scale * 4; i++) {
      this.fire.spawn({
        x: at.x + (Math.random() - 0.5) * scale,
        y: at.y + 0.5 + Math.random() * scale * 0.6,
        z: at.z + (Math.random() - 0.5) * scale,
        vx: (Math.random() - 0.5) * 6 * scale,
        vy: (1 + Math.random() * 4) * scale,
        vz: (Math.random() - 0.5) * 6 * scale,
        life: 0.35 + Math.random() * 0.35,
        size: 2.5 * scale,
        endSize: 5 * scale,
        color: FLASH,
        endColor: FIRE_END,
        drag: 3,
      });
    }
    for (let i = 0; i < 4 + scale * 4; i++) {
      this.smoke.spawn({
        x: at.x + (Math.random() - 0.5) * scale * 1.5,
        y: at.y + 1 + Math.random() * scale,
        z: at.z + (Math.random() - 0.5) * scale * 1.5,
        vx: (Math.random() - 0.5) * 2,
        vy: 1.5 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 2,
        life: 2.5 + Math.random() * 2,
        size: 2.5 * scale,
        endSize: 7 * scale,
        color: SMOKE_DARK,
        endColor: SMOKE_GREY,
        alpha: 0.5,
        drag: 0.8,
      });
    }
    for (let i = 0; i < 8 * scale; i++) {
      this.fire.spawn({
        x: at.x,
        y: at.y + 0.5,
        z: at.z,
        vx: (Math.random() - 0.5) * 22,
        vy: 6 + Math.random() * 12,
        vz: (Math.random() - 0.5) * 22,
        life: 0.6 + Math.random() * 0.5,
        size: 0.35,
        endSize: 0.1,
        color: SPARK,
        endColor: FIRE_END,
        gravity: 25,
      });
    }
    if (scorch) {
      this.addDecal('scorch', at.x, at.z, 4 * scale, WHITE);
    }
    this.flashLight(at, 6 * scale, 0.35);
  }

  /** Large multi-stage destruction for structures. */
  structureDestroyed(at: THREE.Vector3, size: number): void {
    this.explosion(at, 3.2, true);
    for (let i = 0; i < 4; i++) {
      const offset = new THREE.Vector3((Math.random() - 0.5) * size, Math.random() * 3, (Math.random() - 0.5) * size);
      window.setTimeout(() => this.explosion(at.clone().add(offset), 1.8, false), 120 + i * 180);
    }
    this.addDecal('scorch', at.x, at.z, size * 1.4, WHITE);
  }

  vehicleDestroyed(at: THREE.Vector3): void {
    this.explosion(at, 2.0, true);
  }

  infantryKilled(at: THREE.Vector3): void {
    this.burst(at, 0.4, 3);
  }

  /** Continuous smoke (and fire when critical) from damaged structures. */
  damageSmoke(at: THREE.Vector3, health: number, dt: number): void {
    if (Math.random() > dt * (health < 0.25 ? 14 : 6)) {
      return;
    }
    this.smoke.spawn({ x: at.x + (Math.random() - 0.5) * 2, y: at.y, z: at.z + (Math.random() - 0.5) * 2, vx: 0.4, vy: 2.5, vz: -0.2, life: 3, size: 2, endSize: 7, color: SMOKE_DARK, endColor: SMOKE_GREY, alpha: 0.55 });
    if (health < 0.25) {
      this.fire.spawn({ x: at.x + (Math.random() - 0.5) * 2, y: at.y - 0.5, z: at.z + (Math.random() - 0.5) * 2, vy: 2, life: 0.5, size: 1.8, endSize: 0.6, color: FIRE, endColor: FIRE_END });
    }
  }

  /** Dust kicked up by moving vehicles (rate-limited by caller). */
  dust(at: THREE.Vector3): void {
    this.smoke.spawn({ x: at.x, y: at.y + 0.3, z: at.z, vx: (Math.random() - 0.5), vy: 0.6, vz: (Math.random() - 0.5), life: 1.4, size: 1.2, endSize: 3.5, color: DUST, alpha: 0.28, drag: 1 });
  }

  /** Ground ring confirming an order (green move, red attack, amber attack-move/build). */
  orderMarker(at: THREE.Vector3, color: THREE.Color): void {
    this.addDecal('marker', at.x, at.z, 2.5, color);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.delayed.length > 0) {
      const due = this.delayed.filter((d) => d.at <= this.time);
      this.delayed = this.delayed.filter((d) => d.at > this.time);
      due.forEach((d) => d.run());
    }
    this.updateFlights();
    this.updateTracers(dt);
    this.updateDecals(dt);
    for (const item of this.lights) {
      item.age += dt;
      item.light.intensity = item.age < item.duration ? item.intensity * (1 - item.age / item.duration) : 0;
    }
    this.fire.update(dt);
    this.smoke.update(dt);
  }

  private burst(at: THREE.Vector3, scale: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.fire.spawn({ x: at.x, y: at.y + 0.4, z: at.z, vx: (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 8, life: 0.18, size: 1.3 * scale, endSize: 0.3, color: FLASH, endColor: FIRE_END, drag: 4 });
      this.smoke.spawn({ x: at.x, y: at.y + 0.5, z: at.z, vx: (Math.random() - 0.5) * 2, vy: 1.2, vz: (Math.random() - 0.5) * 2, life: 1.0, size: 1.2 * scale, endSize: 3.5 * scale, color: SMOKE_GREY, alpha: 0.5, drag: 1 });
    }
  }

  private updateFlights(): void {
    let write = 0;
    for (const flight of this.flights) {
      const t = (this.time - flight.start) / flight.duration;
      if (t >= 1) {
        continue;
      }
      const pos = this.temp.lerpVectors(flight.from, flight.to, t);
      if (flight.kind === 'arc') {
        pos.y += Math.sin(t * Math.PI) * flight.from.distanceTo(flight.to) * 0.28;
      } else if (flight.kind === 'missile') {
        pos.y += Math.sin(t * Math.PI) * 2.5;
      }
      const head = flight.kind === 'missile' ? 0.9 : flight.kind === 'arc' ? 0.8 : 0.6;
      this.fire.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.03, size: head, color: FLASH, endColor: FIRE });
      if (flight.kind !== 'shell') {
        this.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, life: flight.kind === 'missile' ? 1.1 : 0.7, size: 0.5, endSize: 2.2, color: MISSILE_SMOKE, alpha: 0.5, vy: 0.3 });
      }
      this.flights[write++] = flight;
    }
    this.flights.length = write;
  }

  private updateTracers(dt: number): void {
    let write = 0;
    let segment = 0;
    for (const tracer of this.tracers) {
      tracer.age += dt;
      const t = tracer.age / tracer.duration;
      if (t >= 1.2 || segment >= MAX_TRACERS) {
        continue;
      }
      const head = Math.min(1, t);
      const tail = Math.max(0, t - 0.35);
      const o = segment * 6;
      const ax = tracer.from.x + (tracer.to.x - tracer.from.x) * tail;
      const ay = tracer.from.y + (tracer.to.y - tracer.from.y) * tail;
      const az = tracer.from.z + (tracer.to.z - tracer.from.z) * tail;
      const bx = tracer.from.x + (tracer.to.x - tracer.from.x) * head;
      const by = tracer.from.y + (tracer.to.y - tracer.from.y) * head;
      const bz = tracer.from.z + (tracer.to.z - tracer.from.z) * head;
      this.tracerPositions[o] = ax;
      this.tracerPositions[o + 1] = ay;
      this.tracerPositions[o + 2] = az;
      this.tracerPositions[o + 3] = bx;
      this.tracerPositions[o + 4] = by;
      this.tracerPositions[o + 5] = bz;
      const fade = 1 - Math.max(0, t - 1) * 5;
      for (let k = 0; k < 2; k++) {
        this.tracerColors[o + k * 3] = tracer.color.r * fade;
        this.tracerColors[o + k * 3 + 1] = tracer.color.g * fade;
        this.tracerColors[o + k * 3 + 2] = tracer.color.b * fade;
      }
      segment++;
      this.tracers[write++] = tracer;
    }
    this.tracers.length = write;
    this.tracerGeometry.setDrawRange(0, segment * 2);
    this.tracerGeometry.getAttribute('position').needsUpdate = true;
    this.tracerGeometry.getAttribute('color').needsUpdate = true;
  }

  /** Places a ground decal at world (x, z); height follows terrain and the bridge deck. */
  private addDecal(kind: Decal['kind'], x: number, z: number, size: number, color: THREE.Color): void {
    const sameKind = this.decals.filter((d) => d.kind === kind);
    if (sameKind.length >= MAX_DECALS) {
      this.decals.splice(this.decals.indexOf(sameKind[0]!), 1);
    }
    this.decals.push({ age: 0, size, x, y: groundHeight(this.terrain, x, -z) + 0.08, z, rotation: Math.random() * Math.PI * 2, kind, color: color.clone() });
  }

  private updateDecals(dt: number): void {
    let scorch = 0;
    let marker = 0;
    let write = 0;
    for (const decal of this.decals) {
      decal.age += dt;
      const lifetime = decal.kind === 'scorch' ? SCORCH_LIFETIME : MARKER_LIFETIME;
      if (decal.age >= lifetime) {
        continue;
      }
      this.decals[write++] = decal;
      if (decal.kind === 'scorch') {
        const shrink = decal.age > lifetime - 5 ? (lifetime - decal.age) / 5 : 1;
        this.quaternion.setFromAxisAngle(UP, decal.rotation);
        this.matrix.compose(this.decalPosition.set(decal.x, decal.y, decal.z), this.quaternion, this.decalScale.set(decal.size * shrink, 1, decal.size * shrink));
        this.scorchMesh.setMatrixAt(scorch++, this.matrix);
      } else {
        const t = decal.age / lifetime;
        const s = decal.size * (1 - t * 0.6);
        this.matrix.makeScale(s, 1, s).setPosition(decal.x, decal.y, decal.z);
        this.markerMesh.setMatrixAt(marker, this.matrix);
        this.markerMesh.setColorAt(marker++, this.decalColor.copy(decal.color).multiplyScalar(1 - t));
      }
    }
    this.decals.length = write;
    this.scorchMesh.count = scorch;
    this.markerMesh.count = marker;
    this.scorchMesh.instanceMatrix.needsUpdate = true;
    this.markerMesh.instanceMatrix.needsUpdate = true;
    if (this.markerMesh.instanceColor) {
      this.markerMesh.instanceColor.needsUpdate = true;
    }
  }

  private flashLight(at: THREE.Vector3, intensity: number, duration: number): void {
    const item = this.lights.reduce<(typeof this.lights)[number] | undefined>((oldest, l) => (!oldest || l.age > oldest.age ? l : oldest), undefined);
    if (!item) {
      return;
    }
    item.light.position.set(at.x, at.y + 3, at.z);
    item.age = 0;
    item.duration = duration;
    item.intensity = intensity * 60;
  }
}
