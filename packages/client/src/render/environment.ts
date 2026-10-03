import * as THREE from 'three';
import { Rng, distanceToSegment, type Terrain } from '@conflict/shared';
import type { FogOfWarTexture } from './fogOfWar';
import { ModelBuilder } from './models/builder';
import { PALETTE } from './models/palette';
import { bridgeInfo } from './bridge';
import { detailTexture } from './textures';

/** Water surface, bridge, vegetation and rocks: the static dressing of a map. */
export function buildEnvironment(terrain: Terrain, fow: FogOfWarTexture, vegetationDensity: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'environment';
  group.add(buildSkirt(terrain), buildWater(terrain, fow));
  const bridge = buildBridge(terrain, fow);
  if (bridge) {
    group.add(bridge);
  }
  group.add(...buildVegetation(terrain, fow, vegetationDensity));
  group.add(buildRocks(terrain, fow, vegetationDensity));
  return group;
}

/** Dark ground beyond the playable area so map edges never show sky. */
function buildSkirt(terrain: Terrain): THREE.Mesh {
  const map = terrain.map;
  const geometry = new THREE.PlaneGeometry(map.width * 5, map.height * 5);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(map.width / 2, -3, -map.height / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x07090a }));
  mesh.name = 'skirt';
  return mesh;
}

function buildWater(terrain: Terrain, fow: FogOfWarTexture): THREE.Mesh {
  const map = terrain.map;
  const geometry = new THREE.PlaneGeometry(map.width, map.height, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(map.width / 2, map.waterLevel, -map.height / 2);
  const ripple = detailTexture(128, 4, 0.09, 0.9, 3);
  ripple.repeat.set(map.width / 12, map.height / 12);
  const material = fow.apply(
    new THREE.MeshStandardMaterial({ color: 0x35585c, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.82, bumpMap: ripple, bumpScale: 0.4 }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.userData['ripple'] = ripple;
  return mesh;
}

function buildBridge(terrain: Terrain, fow: FogOfWarTexture): THREE.Mesh | null {
  const bridge = bridgeInfo(terrain);
  if (!bridge) {
    return null;
  }
  const { length, width } = bridge;
  const b = new ModelBuilder();
  b.box(length, 0.6, width, { color: PALETTE.concrete, position: [0, -0.3, 0] }, 0.1);
  b.box(length, 0.05, width - 1.6, { color: 0x4d4b47, position: [0, 0.02, 0] });
  for (const side of [-1, 1]) {
    b.box(length, 0.7, 0.3, { color: PALETTE.concreteDark, position: [0, 0.35, side * (width / 2 - 0.15)] }, 0.05);
  }
  for (const offset of [-length * 0.25, 0, length * 0.25]) {
    b.box(1.6, 6, width - 1, { color: PALETTE.concreteDark, position: [offset, -3.3, 0] }, 0.1);
  }
  const material = fow.apply(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
  const mesh = new THREE.Mesh(b.build(), material);
  mesh.position.set(bridge.x, bridge.deck, -bridge.y);
  mesh.rotation.y = bridge.direction;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'bridge';
  return mesh;
}

function isClear(terrain: Terrain, x: number, y: number): boolean {
  const map = terrain.map;
  if (x < 3 || y < 3 || x > map.width - 3 || y > map.height - 3) {
    return false;
  }
  if (terrain.slopeAt(x, y) > 0.55 || terrain.heightAt(x, y) < map.waterLevel + 0.6) {
    return false;
  }
  for (const road of map.roads) {
    for (let i = 0; i + 1 < road.length; i++) {
      if (distanceToSegment(x, y, road[i]!.x, road[i]!.y, road[i + 1]!.x, road[i + 1]!.y) < 6) {
        return false;
      }
    }
  }
  if (map.supplyFields.some((f) => Math.hypot(f.x - x, f.y - y) < 14)) {
    return false;
  }
  return !map.spawns.some((s) => Math.hypot(s.x - x, s.y - y) < 48);
}

function buildVegetation(terrain: Terrain, fow: FogOfWarTexture, density: number): THREE.InstancedMesh[] {
  const map = terrain.map;
  const rng = new Rng(map.seed * 31 + 7);
  const spots: { x: number; y: number; scale: number }[] = [];
  for (const forest of map.forests) {
    const count = Math.round(((Math.PI * forest.radius * forest.radius) / 14) * forest.density * density);
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.sqrt(rng.next()) * forest.radius;
      const x = forest.x + Math.cos(a) * r;
      const y = forest.y + Math.sin(a) * r;
      if (isClear(terrain, x, y)) {
        spots.push({ x, y, scale: rng.range(0.75, 1.25) });
        placed++;
      }
    }
  }
  const scattered = Math.round(260 * density);
  for (let i = 0; i < scattered; i++) {
    const x = rng.range(0, map.width);
    const y = rng.range(0, map.height);
    if (isClear(terrain, x, y)) {
      spots.push({ x, y, scale: rng.range(0.6, 1.1) });
    }
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.28, 2.4, 6);
  trunkGeometry.translate(0, 1.2, 0);
  const crown = new ModelBuilder();
  crown.add(new THREE.IcosahedronGeometry(1.9, 1), { color: 0xffffff, position: [0, 3.7, 0], scale: [1, 1.15, 1] });
  crown.add(new THREE.IcosahedronGeometry(1.3, 1), { color: 0xffffff, position: [0.6, 4.9, 0.3] });
  crown.add(new THREE.IcosahedronGeometry(1.1, 1), { color: 0xffffff, position: [-0.7, 4.6, -0.4] });
  const crownGeometry = crown.build();
  const leafTexture = detailTexture(64, 77, 0.25, 1.2, 2);

  const trunks = new THREE.InstancedMesh(trunkGeometry, fow.apply(new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 })), spots.length);
  const crowns = new THREE.InstancedMesh(
    crownGeometry,
    fow.apply(new THREE.MeshStandardMaterial({ vertexColors: true, map: leafTexture, roughness: 0.9, flatShading: true })),
    spots.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const tint = new THREE.Color();
  spots.forEach((spot, i) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI * 2);
    matrix.compose(new THREE.Vector3(spot.x, terrain.heightAt(spot.x, spot.y) - 0.1, -spot.y), quaternion, new THREE.Vector3(spot.scale, spot.scale, spot.scale));
    trunks.setMatrixAt(i, matrix);
    crowns.setMatrixAt(i, matrix);
    tint.setHSL(0.2 + rng.range(-0.03, 0.04), 0.35 + rng.range(-0.08, 0.08), 0.27 + rng.range(-0.05, 0.05));
    crowns.setColorAt(i, tint);
  });
  for (const mesh of [trunks, crowns]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }
  return [trunks, crowns];
}

function buildRocks(terrain: Terrain, fow: FogOfWarTexture, density: number): THREE.InstancedMesh {
  const map = terrain.map;
  const rng = new Rng(map.seed * 13 + 3);
  const spots: { x: number; y: number; scale: number }[] = [];
  const attempts = Math.round(9000 * density);
  for (let i = 0; i < attempts && spots.length < 700; i++) {
    const x = rng.range(4, map.width - 4);
    const y = rng.range(4, map.height - 4);
    const slope = terrain.slopeAt(x, y);
    if (slope > 0.5 && slope < 3 && terrain.heightAt(x, y) > map.waterLevel) {
      spots.push({ x, y, scale: rng.range(0.6, 1.8) });
    } else if (rng.chance(0.004) && isClear(terrain, x, y)) {
      spots.push({ x, y, scale: rng.range(0.4, 0.9) });
    }
  }
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) * (0.8 + (i % 3) * 0.15), position.getY(i) * 0.6, position.getZ(i) * (0.85 + (i % 2) * 0.2));
  }
  geometry.computeVertexNormals();
  const material = fow.apply(new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.95, flatShading: true, map: detailTexture(64, 9, 0.2, 1, 2) }));
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, spots.length));
  mesh.count = spots.length;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  spots.forEach((spot, i) => {
    quaternion.setFromEuler(new THREE.Euler(rng.next(), rng.next() * 6, rng.next()));
    matrix.compose(new THREE.Vector3(spot.x, terrain.heightAt(spot.x, spot.y) - 0.2 * spot.scale, -spot.y), quaternion, new THREE.Vector3(spot.scale, spot.scale, spot.scale));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
