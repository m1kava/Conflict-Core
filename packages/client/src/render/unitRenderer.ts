import * as THREE from 'three';
import type { Terrain } from '@conflict/shared';
import { isMoving, type ClientEntity } from '../game/clientWorld';
import { groundHeight } from './bridge';
import type { FogOfWarTexture } from './fogOfWar';
import { InstancedPool } from './instancedPool';
import { TEAM_COLORS } from './models/palette';
import { buildUnitModels, type UnitModel } from './models/units';
import { panelTexture } from './textures';

interface ModelPools {
  model: UnitModel;
  hull: InstancedPool;
  hullTeam: InstancedPool;
  turret?: InstancedPool;
  turretTeam?: InstancedPool;
}

const UP = new THREE.Vector3(0, 1, 0);
const TILT_SAMPLE = 1.8;

/**
 * Draws every unit through per-model instanced pools: hull, team markings, turret and turret markings each
 * cost one draw call regardless of unit count. Vehicles tilt to the terrain; turrets rotate independently;
 * infantry squads render as individual soldiers with a walking bob.
 */
export class UnitRenderer {
  private readonly pools = new Map<string, ModelPools>();
  private readonly matrix = new THREE.Matrix4();
  private readonly turretMatrix = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly teamColors = TEAM_COLORS.map((c) => new THREE.Color(c));

  constructor(
    scene: THREE.Object3D,
    private readonly terrain: Terrain,
    fow: FogOfWarTexture,
  ) {
    const panels = panelTexture(256, 21);
    const bodyMaterial = fow.apply(new THREE.MeshStandardMaterial({ vertexColors: true, map: panels, roughness: 0.62, metalness: 0.32 }));
    // Team markings are partly self-lit so ownership stays readable in shadow and at distance.
    const teamMaterial = fow.apply(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, emissive: 0x555555 }));
    for (const [key, model] of buildUnitModels()) {
      this.pools.set(key, {
        model,
        hull: new InstancedPool(scene, model.hull, bodyMaterial, false, true),
        hullTeam: new InstancedPool(scene, model.hullTeam, teamMaterial, true, false),
        ...(model.turret ? { turret: new InstancedPool(scene, model.turret, bodyMaterial, false, true) } : {}),
        ...(model.turretTeam ? { turretTeam: new InstancedPool(scene, model.turretTeam, teamMaterial, true, false) } : {}),
      });
    }
  }

  modelFor(entity: ClientEntity): UnitModel | undefined {
    return entity.unitDef ? this.pools.get(entity.unitDef.model)?.model : undefined;
  }

  update(units: Iterable<ClientEntity>, time: number): void {
    for (const pools of this.pools.values()) {
      pools.hull.begin();
      pools.hullTeam.begin();
      pools.turret?.begin();
      pools.turretTeam?.begin();
    }
    for (const unit of units) {
      const pools = unit.unitDef ? this.pools.get(unit.unitDef.model) : undefined;
      if (!pools) {
        continue;
      }
      const color = this.teamColors[unit.owner] ?? this.teamColors[0]!;
      if (pools.model.squad) {
        this.drawSquad(unit, pools, color, time);
      } else {
        this.drawVehicle(unit, pools, color);
      }
    }
    for (const pools of this.pools.values()) {
      pools.hull.end();
      pools.hullTeam.end();
      pools.turret?.end();
      pools.turretTeam?.end();
    }
  }

  private drawVehicle(unit: ClientEntity, pools: ModelPools, color: THREE.Color): void {
    const x = unit.x;
    const y = unit.y;
    const cos = Math.cos(unit.heading);
    const sin = Math.sin(unit.heading);
    // Ground normal from four samples around the hull, so vehicles pitch and roll with the slope.
    const front = groundHeight(this.terrain, x + cos * TILT_SAMPLE, y + sin * TILT_SAMPLE);
    const back = groundHeight(this.terrain, x - cos * TILT_SAMPLE, y - sin * TILT_SAMPLE);
    const left = groundHeight(this.terrain, x - sin * TILT_SAMPLE, y + cos * TILT_SAMPLE);
    const right = groundHeight(this.terrain, x + sin * TILT_SAMPLE, y - cos * TILT_SAMPLE);
    const height = Math.max((front + back + left + right) / 4, groundHeight(this.terrain, x, y));
    this.euler.set(Math.atan2(left - right, TILT_SAMPLE * 2), unit.heading, Math.atan2(front - back, TILT_SAMPLE * 2), 'YXZ');
    this.quaternion.setFromEuler(this.euler);
    const s = pools.model.scale;
    this.position.set(x, height, -y);
    this.matrix.compose(this.position, this.quaternion, this.scale.set(s, s, s));
    pools.hull.push(this.matrix);
    pools.hullTeam.push(this.matrix, color);

    if (pools.turret) {
      const pivot = pools.model.turretPivot;
      this.local.makeRotationY(unit.turret - unit.heading).setPosition(pivot.x, pivot.y, pivot.z);
      this.turretMatrix.multiplyMatrices(this.matrix, this.local);
      pools.turret.push(this.turretMatrix);
      pools.turretTeam?.push(this.turretMatrix, color);
    }
  }

  private drawSquad(unit: ClientEntity, pools: ModelPools, color: THREE.Color, time: number): void {
    const squad = pools.model.squad!;
    const moving = isMoving(unit);
    const cos = Math.cos(unit.heading);
    const sin = Math.sin(unit.heading);
    const s = pools.model.scale;
    const members = Math.max(1, Math.ceil(squad.length * Math.min(1, unit.health * 1.15)));
    for (let i = 0; i < members; i++) {
      const offset = squad[i]!;
      const sx = unit.x + offset.x * cos + offset.z * sin;
      const sy = unit.y + offset.x * sin - offset.z * cos;
      const bob = moving ? Math.abs(Math.sin(time * 9 + i * 1.7 + unit.id)) * 0.08 : 0;
      const ground = groundHeight(this.terrain, sx, sy);
      this.position.set(sx, ground + bob, -sy);
      const facing = unit.flags & 4 ? unit.turret : unit.heading;
      this.quaternion.setFromAxisAngle(UP, facing + (moving ? Math.sin(time * 9 + i) * 0.05 : 0));
      this.matrix.compose(this.position, this.quaternion, this.scale.set(s, s, s));
      pools.hull.push(this.matrix);
      pools.hullTeam.push(this.matrix, color);
    }
  }
}
