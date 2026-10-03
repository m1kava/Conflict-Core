import * as THREE from 'three';
import { ModelBuilder } from './builder';
import { PALETTE } from './palette';

export interface BuildingModel {
  body: THREE.BufferGeometry;
  team: THREE.BufferGeometry;
  /** Optional moving part: a spinning radar dish or an aiming turret. */
  animated?: { geometry: THREE.BufferGeometry; pivot: THREE.Vector3; mode: 'spin' | 'turret' };
  height: number;
}

const HALF_PI = Math.PI / 2;

function foundation(b: ModelBuilder, w: number, d: number): void {
  b.box(w, 0.5, d, { color: PALETTE.concreteDark, position: [0, 0.0, 0] }, 0.08);
  b.box(w - 0.6, 0.12, d - 0.6, { color: PALETTE.concrete, position: [0, 0.28, 0] });
}

function windows(b: ModelBuilder, length: number, y: number, x: number, z: number, alongZ: boolean, count: number): void {
  const step = length / count;
  for (let i = 0; i < count; i++) {
    const offset = -length / 2 + step * (i + 0.5);
    b.box(alongZ ? 0.06 : step * 0.6, 0.55, alongZ ? step * 0.6 : 0.06, {
      color: PALETTE.glass,
      position: alongZ ? [x, y, z + offset] : [x + offset, y, z],
    });
  }
}

function headquarters(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 16, 16);
  b.box(11, 5, 10, { color: PALETTE.concrete, position: [-1, 2.8, 0] }, 0.25);
  b.box(11.3, 0.35, 10.3, { color: PALETTE.concreteDark, position: [-1, 5.35, 0] }, 0.08);
  b.box(7, 3, 7, { color: PALETTE.sandLight, position: [-1.8, 7.0, -0.5] }, 0.2);
  b.box(7.3, 0.3, 7.3, { color: PALETTE.concreteDark, position: [-1.8, 8.6, -0.5] }, 0.06);
  windows(b, 9, 3.6, 4.53, 0, true, 6);
  windows(b, 9, 3.6, -1, 5.03, false, 6);
  windows(b, 9, 3.6, -1, -5.03, false, 6);
  windows(b, 6, 7.3, 1.73, -0.5, true, 4);
  b.box(1.4, 0.25, 4.2, { color: PALETTE.slate, position: [5.1, 3.4, 0] }, 0.05);
  b.box(0.1, 2.6, 2.2, { color: PALETTE.glass, position: [4.55, 1.6, 0] });
  b.cylinder(1.1, 1.3, 7, { color: PALETTE.concrete, position: [4.2, 3.8, 4.6] }, 16);
  b.cylinder(1.7, 1.7, 0.6, { color: PALETTE.slate, position: [4.2, 7.6, 4.6] }, 16);
  b.cylinder(0.05, 0.05, 4.5, { color: PALETTE.metal, position: [4.2, 10.1, 4.6] }, 4);
  b.cylinder(0.04, 0.04, 3.5, { color: PALETTE.metal, position: [-3.8, 10.3, -2.6] }, 4);
  b.cylinder(0.04, 0.04, 3.0, { color: PALETTE.metal, position: [-3.2, 10.1, -2.0] }, 4);
  b.lathe([[0.02, 0], [0.8, 0.18], [1.2, 0.45]], { color: PALETTE.slate, position: [-0.2, 9.0, 1.6], rotation: [0, 0, 0.8] }, 16);
  b.cylinder(3.2, 3.2, 0.12, { color: PALETTE.slateDark, position: [4.3, 0.36, -4.6] }, 24);
  b.box(2.2, 0.03, 0.4, { color: PALETTE.white, position: [4.3, 0.44, -4.6] });
  b.box(0.4, 0.03, 2.2, { color: PALETTE.white, position: [3.4, 0.44, -4.6] });
  b.box(0.4, 0.03, 2.2, { color: PALETTE.white, position: [5.2, 0.44, -4.6] });
  for (const [x, z] of [[-4.5, 3.4], [-4.5, 1.6], [-2.5, -3.5]] as const) {
    b.box(1.2, 0.7, 1.0, { color: PALETTE.slate, position: [x, 5.85, z] }, 0.05);
  }
  t.box(0.08, 3.2, 1.8, { color: PALETTE.white, position: [4.56, 3.1, -3.2] });
  t.box(0.08, 3.2, 1.8, { color: PALETTE.white, position: [4.56, 3.1, 3.2] });
  t.box(7.4, 0.3, 0.08, { color: PALETTE.white, position: [-1.8, 8.3, 3.06] });
  t.box(7.4, 0.3, 0.08, { color: PALETTE.white, position: [-1.8, 8.3, -4.06] });
  return { body: b.build(), team: t.build(), height: 11 };
}

function powerPlant(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 10, 10);
  const tower: [number, number][] = [[2.05, 0], [1.8, 1.5], [1.45, 3.6], [1.5, 4.8], [1.7, 6.0], [1.55, 6.0], [1.35, 4.8], [1.3, 3.6]];
  b.lathe(tower, { color: PALETTE.concrete, position: [-2.2, 0.3, -2.4] }, 24);
  b.lathe(tower, { color: PALETTE.concrete, position: [-2.2, 0.3, 2.4] }, 24);
  b.box(3.8, 3.4, 8.4, { color: PALETTE.sandLight, position: [2.6, 2.0, 0] }, 0.15);
  b.box(4.0, 0.25, 8.6, { color: PALETTE.roof, position: [2.6, 3.8, 0] }, 0.05);
  windows(b, 7.5, 2.6, 4.53, 0, true, 5);
  b.cylinder(0.3, 0.3, 3.0, { color: PALETTE.rust, position: [0.1, 1.5, -1.2], rotation: [0, 0, HALF_PI] }, 10);
  b.cylinder(0.3, 0.3, 3.0, { color: PALETTE.rust, position: [0.1, 1.5, 1.2], rotation: [0, 0, HALF_PI] }, 10);
  b.box(1.4, 1.6, 1.2, { color: PALETTE.slate, position: [3.8, 1.1, -3.8] }, 0.06);
  b.box(1.4, 1.6, 1.2, { color: PALETTE.slate, position: [3.8, 1.1, 3.8] }, 0.06);
  b.box(1.42, 0.2, 1.22, { color: PALETTE.warning, position: [3.8, 1.95, -3.8] });
  b.box(1.42, 0.2, 1.22, { color: PALETTE.warning, position: [3.8, 1.95, 3.8] });
  b.cylinder(0.12, 0.15, 5.5, { color: PALETTE.metal, position: [1.4, 5.3, -3.2] }, 8);
  t.box(0.08, 0.6, 7.0, { color: PALETTE.white, position: [4.53, 3.3, 0] });
  return { body: b.build(), team: t.build(), height: 7 };
}

function supplyDepot(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 12, 12);
  b.box(7.5, 4.2, 7.5, { color: PALETTE.sandLight, position: [-1.6, 2.4, -0.4] }, 0.12);
  b.extrude([[-3.9, 0], [3.9, 0], [0, 1.6]], 8.0, { color: PALETTE.roof, position: [-1.6, 4.5, -0.4], rotation: [0, HALF_PI, 0] }, 0.05);
  b.box(0.1, 3.0, 3.6, { color: PALETTE.slateDark, position: [2.2, 1.9, -0.4] });
  for (let i = 0; i < 6; i++) {
    b.box(0.05, 2.9, 0.06, { color: PALETTE.metal, position: [2.27, 1.9, -2.0 + i * 0.64] });
  }
  b.box(2.2, 1.0, 8.0, { color: PALETTE.concreteDark, position: [3.6, 0.75, -0.4] }, 0.05);
  const containers = [PALETTE.rust, PALETTE.olive, PALETTE.slate, 0x8a4a3a];
  containers.forEach((color, i) => {
    b.box(2.6, 1.3, 1.25, { color, position: [-3.6 + (i % 2) * 2.8, 0.95 + Math.floor(i / 2) * 1.32, 4.6] }, 0.04);
  });
  b.box(1.4, 1.0, 1.4, { color: PALETTE.canvas, position: [4.4, 1.0, 4.6] }, 0.05);
  b.box(1.0, 0.8, 1.0, { color: PALETTE.olive, position: [4.4, 1.9, 4.6] }, 0.05);
  for (const z of [-4.6, 3.6]) {
    b.box(0.3, 6.0, 0.3, { color: PALETTE.warning, position: [5.4, 3.3, z] });
  }
  b.box(0.35, 0.4, 8.6, { color: PALETTE.warning, position: [5.4, 6.4, -0.5] });
  b.box(0.6, 0.6, 0.8, { color: PALETTE.slateDark, position: [5.4, 5.9, 0.6] });
  t.box(0.08, 0.7, 6.8, { color: PALETTE.white, position: [2.17, 4.0, -0.4] });
  return { body: b.build(), team: t.build(), height: 7 };
}

function barracks(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 12, 12);
  b.box(8.6, 2.6, 6.4, { color: PALETTE.sandLight, position: [-1.2, 1.6, -1.0] }, 0.12);
  const arch: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (i / 10);
    arch.push([Math.cos(a) * 3.3, Math.sin(a) * 1.4]);
  }
  b.extrude(arch, 9.0, { color: PALETTE.olive, position: [-1.2, 2.85, -1.0], rotation: [0, HALF_PI, 0] }, 0.04);
  b.box(0.1, 2.0, 1.6, { color: PALETTE.slateDark, position: [3.07, 1.3, -1.0] });
  windows(b, 7, 1.9, -1.2, 2.23, false, 5);
  for (let i = 0; i < 7; i++) {
    b.box(0.9, 0.45, 0.6, { color: PALETTE.canvas, position: [-3.6 + i * 1.0, 0.55, 4.1] }, 0.18);
    b.box(0.9, 0.45, 0.6, { color: PALETTE.canvas, position: [-3.1 + i * 1.0, 0.95, 4.1] }, 0.18);
  }
  b.cylinder(0.06, 0.08, 7, { color: PALETTE.metal, position: [4.5, 3.8, 3.8] }, 6);
  t.box(0.05, 1.1, 1.8, { color: PALETTE.white, position: [4.5, 6.6, 4.75] });
  t.box(0.08, 0.6, 5.0, { color: PALETTE.white, position: [3.1, 2.55, -1.0] });
  return { body: b.build(), team: t.build(), height: 7.3 };
}

function vehiclePlant(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 16, 14);
  b.box(11, 5.5, 11, { color: PALETTE.sandLight, position: [-1.6, 3.0, 0] }, 0.15);
  const arch: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (i / 12);
    arch.push([Math.cos(a) * 5.7, Math.sin(a) * 2.2]);
  }
  b.extrude(arch, 11.4, { color: PALETTE.roof, position: [-1.6, 5.7, 0] }, 0.05);
  b.box(0.12, 4.6, 7.6, { color: PALETTE.slateDark, position: [3.95, 2.55, 0] });
  for (let i = 0; i < 9; i++) {
    b.box(0.05, 0.08, 7.4, { color: PALETTE.metal, position: [4.03, 0.6 + i * 0.5, 0] });
  }
  b.box(4.0, 3.2, 3.2, { color: PALETTE.concrete, position: [-3.6, 1.9, -6.0] }, 0.1);
  b.cylinder(0.5, 0.6, 6, { color: PALETTE.concreteDark, position: [-5.6, 5.5, 4.3] }, 12);
  b.box(0.4, 0.5, 13.2, { color: PALETTE.warning, position: [5.8, 6.2, 0] });
  for (const z of [-6.2, 6.2]) {
    b.box(0.35, 6.2, 0.35, { color: PALETTE.warning, position: [5.8, 3.1, z] });
  }
  b.box(1.0, 0.8, 1.0, { color: PALETTE.slateDark, position: [5.8, 5.6, -1.5] });
  windows(b, 9, 4.5, -1.6, 5.53, false, 6);
  t.box(0.08, 0.8, 8.4, { color: PALETTE.white, position: [3.98, 5.2, 0] });
  t.box(9.0, 0.6, 0.08, { color: PALETTE.white, position: [-1.6, 5.0, -5.53] });
  return { body: b.build(), team: t.build(), height: 8 };
}

function guardTower(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 4, 4);
  b.cylinder(1.25, 1.65, 4.2, { color: PALETTE.concrete, position: [0, 2.4, 0] }, 8);
  b.cylinder(1.75, 1.75, 0.35, { color: PALETTE.concreteDark, position: [0, 4.6, 0] }, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.7, 0.4, 0.45, { color: PALETTE.canvas, position: [Math.cos(a) * 1.55, 4.95, Math.sin(a) * 1.55], rotation: [0, -a, 0] }, 0.15);
  }
  const turret = new ModelBuilder();
  turret.cylinder(0.8, 0.9, 0.3, { color: PALETTE.slate, position: [0, 0.15, 0] }, 12);
  turret.box(1.5, 0.8, 1.2, { color: PALETTE.sand, position: [0, 0.7, 0] }, 0.1);
  turret.cylinder(0.05, 0.05, 1.8, { color: PALETTE.gunmetal, position: [1.6, 0.75, -0.25], rotation: [0, 0, -HALF_PI] }, 8);
  turret.box(0.9, 0.35, 0.35, { color: PALETTE.olive, position: [0.4, 1.25, 0.45] }, 0.04);
  turret.cylinder(0.12, 0.12, 0.06, { color: PALETTE.gunmetal, position: [0.86, 1.25, 0.45], rotation: [0, 0, HALF_PI] }, 8);
  t.box(1.0, 0.12, 0.05, { color: PALETTE.white, position: [0, 0.75, -0.62] });
  t.box(1.0, 0.12, 0.05, { color: PALETTE.white, position: [0, 0.75, 0.62] });
  return { body: b.build(), team: t.build(), animated: { geometry: turret.build(), pivot: new THREE.Vector3(0, 4.8, 0), mode: 'turret' }, height: 6.5 };
}

function radarUplink(): BuildingModel {
  const b = new ModelBuilder();
  const t = new ModelBuilder();
  foundation(b, 10, 10);
  b.box(5.5, 3.0, 4.5, { color: PALETTE.sandLight, position: [1.5, 1.8, 1.8] }, 0.12);
  b.box(5.7, 0.25, 4.7, { color: PALETTE.roof, position: [1.5, 3.4, 1.8] });
  windows(b, 4, 2.1, 4.28, 1.8, true, 3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.cylinder(0.08, 0.12, 7.5, { color: PALETTE.metal, position: [-2 + Math.cos(a) * 0.9, 4.0, -2 + Math.sin(a) * 0.9], rotation: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12] }, 6);
  }
  for (let h = 1.5; h < 7.5; h += 1.5) {
    b.box(1.8 - h * 0.1, 0.08, 1.8 - h * 0.1, { color: PALETTE.metal, position: [-2, h, -2] });
  }
  b.box(1.3, 0.5, 1.3, { color: PALETTE.slate, position: [-2, 7.8, -2] }, 0.05);
  const dish = new ModelBuilder();
  dish.lathe([[0.05, 0], [1.2, 0.25], [2.1, 0.75], [2.2, 0.85]], { color: PALETTE.sandLight, position: [0.35, 0.9, 0], rotation: [0, 0, -1.25] }, 20);
  dish.cylinder(0.1, 0.1, 1.4, { color: PALETTE.metal, position: [0.9, 1.2, 0], rotation: [0, 0, -1.0] }, 6);
  dish.box(0.6, 0.6, 0.6, { color: PALETTE.slateDark, position: [0, 0.3, 0] }, 0.05);
  t.box(0.08, 0.5, 3.6, { color: PALETTE.white, position: [4.28, 2.9, 1.8] });
  return { body: b.build(), team: t.build(), animated: { geometry: dish.build(), pivot: new THREE.Vector3(-2, 8.0, -2), mode: 'spin' }, height: 10 };
}

/** Neutral supply cache: pallets, crates and fuel drums around a marker. */
export function supplyFieldModel(): THREE.BufferGeometry {
  const b = new ModelBuilder();
  b.cylinder(4.2, 4.6, 0.15, { color: 0x6f6650, position: [0, 0.05, 0] }, 20);
  const crates: [number, number, number][] = [[-1.6, 0, -1.2], [-0.3, 0, -1.6], [1.2, 0, -1.0], [-1.2, 0, 0.6], [0.4, 0, 0.3], [1.6, 0, 0.9], [-0.5, 1, -1.3], [0.6, 1, 0.5], [-1.4, 0, 2.0]];
  crates.forEach(([x, level, z], i) => {
    b.box(1.2, 0.2, 1.2, { color: 0x7a6343, position: [x, 0.2 + level * 1.1, z] });
    b.box(1.05, 0.85, 1.05, { color: i % 3 === 0 ? PALETTE.olive : i % 3 === 1 ? PALETTE.canvas : 0x7f7552, position: [x, 0.75 + level * 1.1, z] }, 0.06);
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.cylinder(0.32, 0.32, 0.95, { color: i % 2 ? 0x3c5a3c : 0x7b3a2c, position: [2.8 + Math.cos(a) * 0.4, 0.5, -2.2 + Math.sin(a) * 0.4 + (i > 2 ? 0.8 : 0)] }, 10);
  }
  b.cylinder(0.05, 0.05, 3.2, { color: PALETTE.metal, position: [-3.0, 1.6, 2.6] }, 4);
  b.box(0.8, 0.5, 0.04, { color: PALETTE.warning, position: [-2.6, 2.9, 2.6] });
  return b.build();
}

export function buildBuildingModels(): Map<string, BuildingModel> {
  return new Map<string, BuildingModel>([
    ['hq', headquarters()],
    ['power_plant', powerPlant()],
    ['supply_depot', supplyDepot()],
    ['barracks', barracks()],
    ['vehicle_plant', vehiclePlant()],
    ['guard_tower', guardTower()],
    ['radar_uplink', radarUplink()],
  ]);
}
