import * as THREE from 'three';
import type { Terrain } from '@conflict/shared';
import { isComplete, type ClientEntity } from '../game/clientWorld';
import type { FogOfWarTexture } from './fogOfWar';
import { buildBuildingModels, supplyFieldModel, type BuildingModel } from './models/buildings';
import { TEAM_COLORS } from './models/palette';
import { detailTexture } from './textures';

interface BuildingView {
  group: THREE.Group;
  body: THREE.Mesh;
  team: THREE.Mesh;
  animated?: THREE.Mesh;
  scaffold?: THREE.LineSegments;
  model: BuildingModel;
  baseHeight: number;
}

/**
 * Structures are few, so each gets its own small object group (body, team markings, moving part).
 * Construction rises from the foundation inside a scaffold; ghosts (last-known enemy structures under fog)
 * keep rendering where they were last seen.
 */
export class BuildingRenderer {
  private readonly models = buildBuildingModels();
  private readonly views = new Map<number, BuildingView>();
  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly teamMaterials: THREE.MeshStandardMaterial[];
  private readonly scaffoldMaterial = new THREE.LineBasicMaterial({ color: 0xd6a12b, transparent: true, opacity: 0.85 });
  private readonly resourceGeometry = supplyFieldModel();
  private readonly resources = new Map<number, THREE.Mesh>();

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly terrain: Terrain,
    fow: FogOfWarTexture,
  ) {
    const concrete = detailTexture(256, 41, 0.08, 0.5, 3);
    concrete.repeat.set(0.5, 0.5);
    this.bodyMaterial = fow.apply(new THREE.MeshStandardMaterial({ vertexColors: true, map: concrete, roughness: 0.82, metalness: 0.08 }));
    this.teamMaterials = TEAM_COLORS.map((color) => fow.apply(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, emissive: color, emissiveIntensity: 0.12 })));
  }

  update(entities: Iterable<ClientEntity>, time: number): void {
    const seen = new Set<number>();
    for (const entity of entities) {
      if (entity.kind === 'resource') {
        this.updateResource(entity);
        seen.add(entity.id);
        continue;
      }
      if (entity.kind !== 'building' || !entity.buildingDef) {
        continue;
      }
      seen.add(entity.id);
      const view = this.views.get(entity.id) ?? this.create(entity);
      if (!view) {
        continue;
      }
      this.updateView(entity, view, time);
    }
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.scene.remove(view.group);
        view.scaffold?.geometry.dispose();
        this.views.delete(id);
      }
    }
    for (const [id, mesh] of this.resources) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.resources.delete(id);
      }
    }
  }

  /** World-space height of a structure's roof (for health bars and effects). */
  heightOf(entity: ClientEntity): number {
    return entity.buildingDef ? (this.models.get(entity.buildingDef.model)?.height ?? 6) : 3;
  }

  private create(entity: ClientEntity): BuildingView | null {
    const def = entity.buildingDef!;
    const model = this.models.get(def.model);
    if (!model) {
      return null;
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(model.body, this.bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    const team = new THREE.Mesh(model.team, this.teamMaterials[entity.owner] ?? this.teamMaterials[0]!);
    group.add(body, team);
    let animated: THREE.Mesh | undefined;
    if (model.animated) {
      animated = new THREE.Mesh(model.animated.geometry, this.bodyMaterial);
      animated.position.copy(model.animated.pivot);
      animated.castShadow = true;
      group.add(animated);
    }
    // Foundation sits on the highest corner so nothing floats or sinks on gentle slopes.
    const halfW = def.width / 2;
    const halfD = def.depth / 2;
    let baseHeight = -Infinity;
    for (const [dx, dy] of [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD], [0, 0]] as const) {
      baseHeight = Math.max(baseHeight, this.terrain.heightAt(entity.x + dx, entity.y + dy));
    }
    group.position.set(entity.x, baseHeight, -entity.y);
    group.rotation.y = entity.heading;
    this.scene.add(group);
    const view: BuildingView = { group, body, team, model, baseHeight, ...(animated ? { animated } : {}) };
    this.views.set(entity.id, view);
    return view;
  }

  private updateView(entity: ClientEntity, view: BuildingView, time: number): void {
    const complete = isComplete(entity);
    const progress = complete ? 1 : entity.progress;
    view.group.scale.set(1, 0.08 + 0.92 * progress, 1);
    if (!complete && !view.scaffold) {
      const def = entity.buildingDef!;
      const box = new THREE.BoxGeometry(def.width * 0.96, view.model.height, def.depth * 0.96);
      box.translate(0, view.model.height / 2, 0);
      view.scaffold = new THREE.LineSegments(new THREE.EdgesGeometry(box), this.scaffoldMaterial);
      view.scaffold.position.copy(view.group.position);
      view.scaffold.rotation.y = entity.heading;
      this.scene.add(view.scaffold);
      box.dispose();
    } else if (complete && view.scaffold) {
      this.scene.remove(view.scaffold);
      view.scaffold.geometry.dispose();
      delete view.scaffold;
    }
    if (view.animated && view.model.animated) {
      if (view.model.animated.mode === 'spin') {
        const powered = (entity.flags & 16) === 0;
        view.animated.rotation.y = complete && powered ? time * 1.2 : view.animated.rotation.y;
      } else {
        view.animated.rotation.y = entity.turret - entity.heading;
      }
    }
    view.team.visible = !entity.ghost;
  }

  private updateResource(entity: ClientEntity): void {
    let mesh = this.resources.get(entity.id);
    if (!mesh) {
      mesh = new THREE.Mesh(this.resourceGeometry, this.bodyMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(entity.x, this.terrain.heightAt(entity.x, entity.y), -entity.y);
      mesh.rotation.y = entity.id * 1.7;
      this.scene.add(mesh);
      this.resources.set(entity.id, mesh);
    }
    const remaining = 0.35 + 0.65 * entity.progress;
    mesh.scale.set(1, remaining, 1);
  }

  dispose(): void {
    for (const view of this.views.values()) {
      this.scene.remove(view.group);
      if (view.scaffold) {
        this.scene.remove(view.scaffold);
      }
    }
    for (const mesh of this.resources.values()) {
      this.scene.remove(mesh);
    }
    this.views.clear();
    this.resources.clear();
  }
}
