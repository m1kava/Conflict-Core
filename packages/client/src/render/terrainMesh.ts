import * as THREE from 'three';
import { distanceToSegment, fractalNoise, smoothstep, type Terrain } from '@conflict/shared';
import type { FogOfWarTexture } from './fogOfWar';
import { detailTexture } from './textures';

const GRASS_DRY = new THREE.Color(0x8f8a55);
const GRASS_GREEN = new THREE.Color(0x66753c);
const DIRT = new THREE.Color(0x92785a);
const ROAD = new THREE.Color(0x9a8a6c);
const ROCK = new THREE.Color(0x857f76);
const SAND = new THREE.Color(0xa69575);
const RIVERBED = new THREE.Color(0x5a503f);
const BASE_GRAVEL = new THREE.Color(0x938b77);

/** World position mapping shared by all renderers: sim (x, y) on the ground → three (x, height, −y). */
export function toWorld(terrain: Terrain, x: number, y: number, lift = 0): THREE.Vector3 {
  return new THREE.Vector3(x, terrain.heightAt(x, y) + lift, -y);
}

function roadDistance(terrain: Terrain, x: number, y: number): number {
  let best = Infinity;
  for (const road of terrain.map.roads) {
    for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i]!;
      const b = road[i + 1]!;
      best = Math.min(best, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
    }
  }
  return best;
}

/**
 * Terrain mesh built from the shared analytic height function, coloured per vertex (grass, dirt roads,
 * rock on steep slopes, sand banks, base gravel) and modulated by a tiling detail texture.
 */
export function buildTerrainMesh(terrain: Terrain, cellSize: number, fow: FogOfWarTexture): THREE.Mesh {
  const map = terrain.map;
  const columns = Math.round(map.width / cellSize);
  const rows = Math.round(map.height / cellSize);
  const vertexCount = (columns + 1) * (rows + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const color = new THREE.Color();

  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const x = column * cellSize;
      const y = row * cellSize;
      const i = row * (columns + 1) + column;
      const h = terrain.heightAt(x, y);
      positions[i * 3] = x;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = -y;
      uvs[i * 2] = x / 8;
      uvs[i * 2 + 1] = y / 8;

      const moisture = fractalNoise(x / 40, y / 40, map.seed + 91, 3);
      color.copy(GRASS_DRY).lerp(GRASS_GREEN, smoothstep(0.35, 0.7, moisture));
      const patches = fractalNoise(x / 14, y / 14, map.seed + 17, 3);
      color.lerp(DIRT, smoothstep(0.62, 0.8, patches) * 0.7);

      let nearestBase = Infinity;
      for (const spawn of map.spawns) {
        nearestBase = Math.min(nearestBase, Math.hypot(x - spawn.x, y - spawn.y));
      }
      color.lerp(BASE_GRAVEL, (1 - smoothstep(14, 34, nearestBase)) * 0.75);

      for (const field of map.supplyFields) {
        const d = Math.hypot(x - field.x, y - field.y);
        color.lerp(DIRT, (1 - smoothstep(4, 11, d)) * 0.8);
      }

      const road = roadDistance(terrain, x, y);
      color.lerp(ROAD, (1 - smoothstep(2.5, 4.5, road)) * 0.9);

      const river = terrain.distanceToRiver(x, y);
      const riverWidth = map.river?.width ?? 0;
      color.lerp(SAND, (1 - smoothstep(riverWidth * 0.5 + 2, riverWidth * 0.5 + 9, river)) * 0.85);
      color.lerp(RIVERBED, 1 - smoothstep(riverWidth * 0.25, riverWidth * 0.5 + 1, river));

      const slope = terrain.slopeAt(x, y);
      color.lerp(ROCK, smoothstep(0.45, 0.85, slope));

      const shade = 1.22 + (fractalNoise(x / 6, y / 6, map.seed + 5, 2) - 0.5) * 0.12;
      colors[i * 3] = color.r * shade;
      colors[i * 3 + 1] = color.g * shade;
      colors[i * 3 + 2] = color.b * shade;
    }
  }

  const indices = new Uint32Array(columns * rows * 6);
  let k = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const detail = detailTexture(256, map.seed, 0.05, 0.55);
  const material = fow.apply(
    new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0, bumpMap: detail, bumpScale: 0.6 }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
