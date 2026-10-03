import * as THREE from 'three';
import { ModelBuilder } from './builder';
import { PALETTE } from './palette';

/** Geometry for one unit type, split into parts the renderer instances independently. */
export interface UnitModel {
  hull: THREE.BufferGeometry;
  /** Team-coloured hull details (instance colour = player colour). */
  hullTeam: THREE.BufferGeometry;
  turret?: THREE.BufferGeometry;
  turretTeam?: THREE.BufferGeometry;
  /** Turret pivot relative to the hull origin. */
  turretPivot: THREE.Vector3;
  /** Infantry: number of soldiers and their formation offsets (metres, model space). */
  squad?: { x: number; z: number }[];
  /** Uniform scale applied for readability at RTS distance. */
  scale: number;
  selectionRadius: number;
}

const HALF_PI = Math.PI / 2;

function stadium(length: number, height: number, segments = 6): [number, number][] {
  const r = height / 2;
  const points: [number, number][] = [];
  const half = length / 2 - r;
  for (let i = 0; i <= segments; i++) {
    const a = -HALF_PI + (Math.PI * i) / segments;
    points.push([half + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= segments; i++) {
    const a = HALF_PI + (Math.PI * i) / segments;
    points.push([-half + Math.cos(a) * r, r + Math.sin(a) * r]);
  }
  return points;
}

/** Track assemblies with road wheels, sprockets and side skirts on both sides. */
function addTracks(b: ModelBuilder, length: number, halfWidth: number, trackWidth: number, wheelCount: number): void {
  for (const side of [-1, 1]) {
    const z = side * halfWidth;
    b.extrude(stadium(length, 0.95), trackWidth, { color: PALETTE.track, position: [0, 0.02, z] }, 0.04);
    const spacing = (length - 1.4) / (wheelCount - 1);
    for (let i = 0; i < wheelCount; i++) {
      const x = -length / 2 + 0.7 + i * spacing;
      b.cylinder(0.34, 0.34, 0.12, { color: PALETTE.slateDark, position: [x, 0.38, z + side * (trackWidth / 2 + 0.02)], rotation: [HALF_PI, 0, 0] }, 14);
      b.cylinder(0.14, 0.14, 0.14, { color: PALETTE.metal, position: [x, 0.38, z + side * (trackWidth / 2 + 0.05)], rotation: [HALF_PI, 0, 0] }, 8);
    }
    b.cylinder(0.3, 0.3, 0.14, { color: PALETTE.metal, position: [length / 2 - 0.45, 0.62, z + side * (trackWidth / 2 + 0.02)], rotation: [HALF_PI, 0, 0] }, 10);
    b.cylinder(0.3, 0.3, 0.14, { color: PALETTE.metal, position: [-length / 2 + 0.45, 0.62, z + side * (trackWidth / 2 + 0.02)], rotation: [HALF_PI, 0, 0] }, 10);
    b.box(length * 0.86, 0.42, 0.07, { color: PALETTE.sandDark, position: [0.1, 0.92, z + side * (trackWidth / 2 + 0.06)] }, 0.02);
  }
}

function addWheels(b: ModelBuilder, positions: number[], halfWidth: number, radius: number, thickness: number): void {
  for (const x of positions) {
    for (const side of [-1, 1]) {
      const z = side * halfWidth;
      b.cylinder(radius, radius, thickness, { color: PALETTE.rubber, position: [x, radius, z], rotation: [HALF_PI, 0, 0] }, 16);
      b.cylinder(radius * 0.55, radius * 0.55, thickness + 0.04, { color: PALETTE.slateDark, position: [x, radius, z], rotation: [HALF_PI, 0, 0] }, 10);
    }
  }
}

function barrel(b: ModelBuilder, from: number, length: number, y: number, radius: number, color: number = PALETTE.gunmetal): void {
  b.cylinder(radius, radius * 1.1, length, { color, position: [from + length / 2, y, 0], rotation: [0, 0, -HALF_PI] }, 10);
}

function mainBattleTank(): UnitModel {
  const hull = new ModelBuilder();
  addTracks(hull, 7.0, 1.45, 0.62, 6);
  hull.extrude([[-3.55, 0.5], [2.9, 0.5], [3.75, 0.95], [3.0, 1.2], [-3.4, 1.2], [-3.65, 0.95]], 2.4, { color: PALETTE.sandDark });
  hull.extrude([[-3.45, 1.05], [2.6, 1.05], [3.65, 1.22], [2.85, 1.62], [-3.25, 1.68], [-3.55, 1.42]], 3.5, { color: PALETTE.sand }, 0.06);
  hull.box(1.5, 0.08, 1.2, { color: PALETTE.slateDark, position: [-2.55, 1.71, -0.75] });
  hull.box(1.5, 0.08, 1.2, { color: PALETTE.slateDark, position: [-2.55, 1.71, 0.75] });
  hull.box(0.4, 0.5, 0.9, { color: PALETTE.sandDark, position: [-3.3, 1.35, -1.25] }, 0.04);
  hull.box(0.4, 0.5, 0.9, { color: PALETTE.sandDark, position: [-3.3, 1.35, 1.25] }, 0.04);
  hull.box(0.12, 0.14, 0.3, { color: PALETTE.glass, position: [3.62, 1.2, -1.3] });
  hull.box(0.12, 0.14, 0.3, { color: PALETTE.glass, position: [3.62, 1.2, 1.3] });
  hull.box(0.5, 0.06, 0.5, { color: PALETTE.slate, position: [2.3, 1.66, 0.85] }, 0.02);
  const hullTeam = new ModelBuilder();
  hullTeam.box(0.06, 0.22, 2.2, { color: PALETTE.white, position: [-3.5, 1.4, 0] });

  const turret = new ModelBuilder();
  turret.extrude([[-2.35, 0], [1.5, 0], [2.35, 0.32], [1.65, 0.86], [-2.0, 0.92], [-2.45, 0.55]], 3.0, { color: PALETTE.sand }, 0.07);
  turret.box(1.3, 0.55, 0.42, { color: PALETTE.sandDark, position: [1.65, 0.42, -1.25], rotation: [0, 0.35, 0] }, 0.05);
  turret.box(1.3, 0.55, 0.42, { color: PALETTE.sandDark, position: [1.65, 0.42, 1.25], rotation: [0, -0.35, 0] }, 0.05);
  turret.box(0.5, 0.55, 0.85, { color: PALETTE.slate, position: [2.35, 0.45, 0] }, 0.06);
  barrel(turret, 2.5, 5.2, 0.45, 0.095);
  turret.cylinder(0.16, 0.16, 0.9, { color: PALETTE.slateDark, position: [4.3, 0.45, 0], rotation: [0, 0, -HALF_PI] }, 10);
  turret.cylinder(0.13, 0.12, 0.35, { color: PALETTE.gunmetal, position: [7.55, 0.45, 0], rotation: [0, 0, -HALF_PI] }, 10);
  turret.cylinder(0.38, 0.4, 0.26, { color: PALETTE.sandDark, position: [-0.6, 1.03, -0.7] }, 14);
  turret.box(0.55, 0.3, 0.4, { color: PALETTE.slate, position: [-0.55, 1.3, -0.7] }, 0.03);
  barrel(turret, -0.3, 0.7, 1.32, 0.025);
  turret.cylinder(0.26, 0.28, 0.2, { color: PALETTE.sandDark, position: [-0.3, 1.0, 0.75] }, 12);
  turret.box(0.65, 0.5, 2.7, { color: PALETTE.slateDark, position: [-2.65, 0.45, 0] }, 0.04);
  for (const side of [-1, 1]) {
    turret.cylinder(0.015, 0.015, 1.8, { color: PALETTE.metal, position: [-1.9, 1.8, side * 1.1] }, 4);
    for (let i = 0; i < 3; i++) {
      turret.cylinder(0.07, 0.07, 0.3, { color: PALETTE.slateDark, position: [0.9, 0.75 + i * 0.12, side * 1.45], rotation: [side * 0.6, 0, 0] }, 6);
    }
  }
  const turretTeam = new ModelBuilder();
  turretTeam.box(1.6, 0.16, 0.04, { color: PALETTE.white, position: [-0.6, 0.6, -1.53] });
  turretTeam.box(1.6, 0.16, 0.04, { color: PALETTE.white, position: [-0.6, 0.6, 1.53] });
  turretTeam.box(1.7, 0.04, 1.2, { color: PALETTE.white, position: [-1.2, 0.93, 0.25] });
  hullTeam.box(1.2, 0.04, 3.0, { color: PALETTE.white, position: [-1.6, 1.69, 0] });

  return { hull: hull.build(), hullTeam: hullTeam.build(), turret: turret.build(), turretTeam: turretTeam.build(), turretPivot: new THREE.Vector3(0.25, 1.66, 0), scale: 1, selectionRadius: 4.2 };
}

function reconVehicle(): UnitModel {
  const hull = new ModelBuilder();
  addWheels(hull, [-1.75, 1.55], 1.12, 0.52, 0.38);
  hull.extrude([[-2.75, 0.7], [2.2, 0.7], [2.85, 1.1], [2.45, 1.7], [1.2, 2.0], [-2.6, 2.02], [-2.85, 1.55]], 2.3, { color: PALETTE.sand }, 0.06);
  hull.box(5.1, 0.5, 2.5, { color: PALETTE.sandDark, position: [-0.2, 0.95, 0] }, 0.08);
  hull.box(0.9, 0.42, 2.05, { color: PALETTE.glass, position: [1.85, 1.68, 0], rotation: [0, 0, 0.75] }, 0.02);
  hull.box(1.2, 0.3, 0.06, { color: PALETTE.glass, position: [0.6, 1.65, -1.16] });
  hull.box(1.2, 0.3, 0.06, { color: PALETTE.glass, position: [0.6, 1.65, 1.16] });
  hull.box(0.5, 0.3, 2.6, { color: PALETTE.slateDark, position: [2.85, 0.85, 0] }, 0.05);
  hull.box(0.6, 0.55, 0.5, { color: PALETTE.slate, position: [-2.6, 1.6, 0.85] }, 0.04);
  for (const side of [-1, 1]) {
    hull.cylinder(0.015, 0.015, 2.2, { color: PALETTE.metal, position: [-2.4, 3.0, side * 0.9] }, 4);
  }
  const hullTeam = new ModelBuilder();
  hullTeam.box(2.4, 0.16, 0.04, { color: PALETTE.white, position: [-1.0, 1.3, -1.18] });
  hullTeam.box(2.4, 0.16, 0.04, { color: PALETTE.white, position: [-1.0, 1.3, 1.18] });

  const turret = new ModelBuilder();
  turret.cylinder(0.6, 0.65, 0.25, { color: PALETTE.slate, position: [0, 0.12, 0] }, 16);
  turret.box(1.2, 0.5, 0.75, { color: PALETTE.sand, position: [0.1, 0.5, 0] }, 0.08);
  turret.box(0.3, 0.3, 0.32, { color: PALETTE.glass, position: [0.25, 0.85, 0.25] }, 0.03);
  barrel(turret, 0.6, 2.2, 0.48, 0.05);
  turret.cylinder(0.08, 0.08, 0.25, { color: PALETTE.gunmetal, position: [2.75, 0.48, 0], rotation: [0, 0, -HALF_PI] }, 8);
  turret.box(0.5, 0.35, 0.25, { color: PALETTE.slateDark, position: [-0.1, 0.5, -0.5] }, 0.03);
  const turretTeam = new ModelBuilder();
  turretTeam.box(1.0, 0.04, 0.6, { color: PALETTE.white, position: [0.05, 0.77, 0] });
  hullTeam.box(1.6, 0.04, 2.0, { color: PALETTE.white, position: [-1.7, 2.04, 0] });
  return { hull: hull.build(), hullTeam: hullTeam.build(), turret: turret.build(), turretTeam: turretTeam.build(), turretPivot: new THREE.Vector3(-0.45, 2.02, 0), scale: 1, selectionRadius: 3.2 };
}

function antiAirVehicle(): UnitModel {
  const hull = new ModelBuilder();
  addTracks(hull, 6.2, 1.3, 0.55, 5);
  hull.extrude([[-3.1, 0.5], [2.6, 0.5], [3.3, 0.95], [2.8, 1.5], [-2.95, 1.55], [-3.2, 1.25]], 3.1, { color: PALETTE.sand }, 0.06);
  hull.box(1.2, 0.06, 1.0, { color: PALETTE.slateDark, position: [-2.2, 1.57, 0] });
  hull.box(0.1, 0.12, 0.3, { color: PALETTE.glass, position: [3.2, 1.05, -1.1] });
  hull.box(0.1, 0.12, 0.3, { color: PALETTE.glass, position: [3.2, 1.05, 1.1] });
  const hullTeam = new ModelBuilder();
  hullTeam.box(0.06, 0.2, 2.0, { color: PALETTE.white, position: [-3.15, 1.3, 0] });

  const turret = new ModelBuilder();
  turret.cylinder(1.1, 1.2, 0.3, { color: PALETTE.slate, position: [0, 0.15, 0] }, 18);
  turret.box(2.0, 0.8, 1.6, { color: PALETTE.sand, position: [0, 0.7, 0] }, 0.1);
  for (const side of [-1, 1]) {
    turret.box(1.9, 0.75, 0.62, { color: PALETTE.sandDark, position: [0.25, 1.0, side * 1.15], rotation: [0, 0, 0.18] }, 0.05);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        turret.cylinder(0.13, 0.13, 0.06, { color: PALETTE.gunmetal, position: [1.21, 1.15 + r * 0.3 - 0.15, side * 1.15 + (c - 0.5) * 0.3], rotation: [0, 0, HALF_PI] }, 8);
      }
    }
    barrel(turret, 0.9, 1.8, 0.55, 0.04);
  }
  turret.cylinder(0.06, 0.06, 1.1, { color: PALETTE.metal, position: [-0.7, 1.55, 0] }, 6);
  turret.lathe([[0.02, 0], [0.5, 0.12], [0.75, 0.32], [0.78, 0.36]], { color: PALETTE.slate, position: [-0.7, 2.1, 0], rotation: [0, 0, 1.2] }, 16);
  const turretTeam = new ModelBuilder();
  turretTeam.box(1.2, 0.14, 0.04, { color: PALETTE.white, position: [0, 0.55, -0.82] });
  turretTeam.box(1.2, 0.14, 0.04, { color: PALETTE.white, position: [0, 0.55, 0.82] });
  turretTeam.box(1.6, 0.04, 1.3, { color: PALETTE.white, position: [0.1, 1.11, 0] });
  return { hull: hull.build(), hullTeam: hullTeam.build(), turret: turret.build(), turretTeam: turretTeam.build(), turretPivot: new THREE.Vector3(-0.2, 1.55, 0), scale: 1, selectionRadius: 3.8 };
}

function selfPropelledGun(): UnitModel {
  const hull = new ModelBuilder();
  addTracks(hull, 7.0, 1.45, 0.62, 6);
  hull.extrude([[-3.5, 0.5], [2.9, 0.5], [3.7, 0.95], [3.1, 1.45], [-3.35, 1.5], [-3.6, 1.2]], 3.4, { color: PALETTE.sand }, 0.06);
  hull.box(1.4, 0.08, 1.2, { color: PALETTE.slateDark, position: [2.2, 1.5, 0] });
  hull.box(0.4, 0.7, 0.25, { color: PALETTE.slateDark, position: [3.2, 1.7, 0] }, 0.03);
  const hullTeam = new ModelBuilder();
  hullTeam.box(0.06, 0.22, 2.2, { color: PALETTE.white, position: [-3.55, 1.2, 0] });

  const turret = new ModelBuilder();
  turret.extrude([[-2.3, 0], [1.6, 0], [2.0, 0.5], [1.7, 1.55], [-2.2, 1.6], [-2.35, 0.8]], 3.0, { color: PALETTE.sand }, 0.08);
  turret.box(0.7, 0.7, 0.9, { color: PALETTE.slate, position: [2.05, 0.7, 0] }, 0.06);
  barrel(turret, 2.3, 7.0, 0.72, 0.11);
  turret.box(0.6, 0.32, 0.5, { color: PALETTE.gunmetal, position: [9.4, 0.72, 0] }, 0.04);
  turret.box(1.0, 0.25, 0.8, { color: PALETTE.slateDark, position: [-1.1, 1.72, 0.6] }, 0.04);
  turret.cylinder(0.3, 0.32, 0.22, { color: PALETTE.sandDark, position: [-0.2, 1.7, -0.75] }, 12);
  const turretTeam = new ModelBuilder();
  turretTeam.box(1.8, 0.18, 0.04, { color: PALETTE.white, position: [-0.3, 1.0, -1.53] });
  turretTeam.box(1.8, 0.18, 0.04, { color: PALETTE.white, position: [-0.3, 1.0, 1.53] });
  turretTeam.box(2.0, 0.04, 1.6, { color: PALETTE.white, position: [-0.6, 1.63, -0.4] });
  return { hull: hull.build(), hullTeam: hullTeam.build(), turret: turret.build(), turretTeam: turretTeam.build(), turretPivot: new THREE.Vector3(-0.9, 1.48, 0), scale: 1, selectionRadius: 4.2 };
}

function supplyTruck(): UnitModel {
  const hull = new ModelBuilder();
  addWheels(hull, [-2.0, -0.9, 2.1], 1.05, 0.5, 0.36);
  hull.box(6.6, 0.35, 2.0, { color: PALETTE.metal, position: [0, 0.75, 0] });
  hull.extrude([[1.4, 0.9], [3.35, 0.9], [3.45, 1.7], [3.05, 2.55], [1.45, 2.6]], 2.4, { color: PALETTE.sand }, 0.07);
  hull.box(0.35, 0.65, 2.0, { color: PALETTE.glass, position: [3.18, 2.12, 0], rotation: [0, 0, 0.45] }, 0.02);
  hull.box(0.9, 0.4, 0.06, { color: PALETTE.glass, position: [2.3, 2.1, -1.21] });
  hull.box(0.9, 0.4, 0.06, { color: PALETTE.glass, position: [2.3, 2.1, 1.21] });
  hull.box(0.25, 0.25, 2.5, { color: PALETTE.slateDark, position: [3.45, 1.0, 0] }, 0.04);
  hull.box(4.4, 0.18, 2.4, { color: PALETTE.sandDark, position: [-0.9, 1.0, 0] });
  hull.box(1.9, 1.3, 2.1, { color: PALETTE.olive, position: [-0.05, 1.75, 0] }, 0.05);
  hull.box(1.9, 1.1, 2.1, { color: PALETTE.canvas, position: [-2.05, 1.65, 0] }, 0.05);
  for (const z of [-0.55, 0.55]) {
    hull.box(0.08, 1.1, 0.08, { color: PALETTE.metal, position: [-1.07, 1.75, z * 1.9] });
  }
  hull.cylinder(0.08, 0.08, 1.2, { color: PALETTE.metal, position: [1.35, 2.5, 0.95] }, 6);
  const hullTeam = new ModelBuilder();
  hullTeam.box(1.6, 0.25, 0.04, { color: PALETTE.white, position: [-0.05, 2.1, -1.08] });
  hullTeam.box(1.6, 0.25, 0.04, { color: PALETTE.white, position: [-0.05, 2.1, 1.08] });
  hullTeam.box(1.4, 0.04, 2.0, { color: PALETTE.white, position: [2.25, 2.62, 0], rotation: [0, 0, -0.03] });
  return { hull: hull.build(), hullTeam: hullTeam.build(), turretPivot: new THREE.Vector3(), scale: 1, selectionRadius: 3.6 };
}

type SoldierKit = 'rifle' | 'launcher' | 'engineer';

function soldier(kit: SoldierKit): { body: THREE.BufferGeometry; team: THREE.BufferGeometry } {
  const b = new ModelBuilder();
  for (const side of [-1, 1]) {
    b.box(0.2, 0.82, 0.19, { color: PALETTE.uniform, position: [0, 0.43, side * 0.11] }, 0.04);
    b.box(0.28, 0.12, 0.2, { color: PALETTE.rubber, position: [0.04, 0.05, side * 0.11] }, 0.03);
  }
  b.box(0.32, 0.62, 0.46, { color: PALETTE.uniform, position: [0, 1.15, 0] }, 0.08);
  b.box(0.36, 0.42, 0.5, { color: kit === 'engineer' ? PALETTE.hiVis : PALETTE.vest, position: [0.01, 1.2, 0] }, 0.07);
  b.box(0.24, 0.42, 0.36, { color: PALETTE.vest, position: [-0.27, 1.22, 0] }, 0.05);
  b.sphere(0.12, { color: PALETTE.skin, position: [0.02, 1.6, 0] }, 10, 8);
  b.add(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), { color: kit === 'engineer' ? PALETTE.warning : PALETTE.sandDark, position: [0, 1.64, 0] });
  b.box(0.5, 0.11, 0.11, { color: PALETTE.uniform, position: [0.2, 1.22, -0.25], rotation: [0, 0.4, -0.2] }, 0.03);
  b.box(0.5, 0.11, 0.11, { color: PALETTE.uniform, position: [0.2, 1.22, 0.25], rotation: [0, -0.4, -0.2] }, 0.03);
  if (kit === 'rifle') {
    b.box(0.95, 0.08, 0.06, { color: PALETTE.gunmetal, position: [0.45, 1.25, 0.05] });
    b.box(0.12, 0.18, 0.05, { color: PALETTE.gunmetal, position: [0.3, 1.14, 0.05] });
  } else if (kit === 'launcher') {
    b.cylinder(0.085, 0.085, 1.35, { color: PALETTE.olive, position: [0.15, 1.5, 0.2], rotation: [0, 0, -HALF_PI] }, 10);
    b.box(0.22, 0.2, 0.18, { color: PALETTE.slateDark, position: [0.25, 1.62, 0.2] });
  } else {
    b.box(0.4, 0.28, 0.16, { color: PALETTE.warning, position: [0.25, 0.85, 0.3] }, 0.03);
    b.box(0.08, 0.08, 0.5, { color: PALETTE.metal, position: [0.35, 1.2, 0.0], rotation: [0.3, 0, 0] });
  }
  const team = new ModelBuilder();
  team.box(0.4, 0.1, 0.54, { color: PALETTE.white, position: [0.01, 1.3, 0] });
  team.add(new THREE.SphereGeometry(0.165, 10, 4, 0, Math.PI * 2, 0, Math.PI / 5), { color: PALETTE.white, position: [0, 1.645, 0] });
  return { body: b.build(), team: team.build() };
}

function infantry(kit: SoldierKit, squad: { x: number; z: number }[]): UnitModel {
  const parts = soldier(kit);
  return { hull: parts.body, hullTeam: parts.team, turretPivot: new THREE.Vector3(), squad, scale: 1.3, selectionRadius: 2.2 };
}

/** Builds every unit model once; keyed by the `model` field of unit definitions. */
export function buildUnitModels(): Map<string, UnitModel> {
  return new Map<string, UnitModel>([
    ['mbt', mainBattleTank()],
    ['recon_vehicle', reconVehicle()],
    ['aa_vehicle', antiAirVehicle()],
    ['spg', selfPropelledGun()],
    ['supply_truck', supplyTruck()],
    ['rifle_squad', infantry('rifle', [{ x: 0.6, z: -0.6 }, { x: 0.6, z: 0.6 }, { x: -0.6, z: -0.6 }, { x: -0.6, z: 0.6 }])],
    ['at_team', infantry('launcher', [{ x: 0.3, z: -0.55 }, { x: -0.3, z: 0.55 }])],
    ['engineer', infantry('engineer', [{ x: 0, z: 0 }])],
  ]);
}
