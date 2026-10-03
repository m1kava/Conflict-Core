import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Vec3 = [number, number, number];

export interface PartOptions {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color: THREE.ColorRepresentation;
}

/**
 * Assembles a model from primitive parts into one vertex-coloured geometry (one draw call). Model space is in
 * metres, +Y up, and models face +X: the simulation heading (0 = +x, counter-clockwise toward +y = north)
 * maps directly onto a rotation about Y because world Z = −north.
 */
export class ModelBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  add(geometry: THREE.BufferGeometry, options: PartOptions): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        g.deleteAttribute(name);
      }
    }
    if (!g.getAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
    }
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...(options.position ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(options.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...(options.scale ?? [1, 1, 1])),
    );
    g.applyMatrix4(matrix);
    const color = new THREE.Color(options.color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, options: PartOptions, bevel = 0): this {
    const geometry = bevel > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, Math.min(w, h, d) / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d);
    return this.add(geometry, options);
  }

  /** Cylinder whose axis is along Y by default. */
  cylinder(radiusTop: number, radiusBottom: number, height: number, options: PartOptions, segments = 12): this {
    return this.add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), options);
  }

  sphere(radius: number, options: PartOptions, widthSegments = 12, heightSegments = 8): this {
    return this.add(new THREE.SphereGeometry(radius, widthSegments, heightSegments), options);
  }

  /** Extrudes a 2D profile (x, y) along Z by `depth`, centred on Z, with an optional bevel. */
  extrude(profile: [number, number][], depth: number, options: PartOptions, bevel = 0.05): this {
    const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.01, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -depth / 2 + bevel);
    return this.add(geometry, options);
  }

  /** Surface of revolution around Y from (radius, height) points. */
  lathe(points: [number, number][], options: PartOptions, segments = 20): this {
    return this.add(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments), options);
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) {
      return new THREE.BufferGeometry();
    }
    const merged = mergeGeometries(this.parts, false);
    if (!merged) {
      throw new Error('Failed to merge model geometry.');
    }
    merged.computeBoundingSphere();
    for (const part of this.parts) {
      part.dispose();
    }
    this.parts.length = 0;
    return merged;
  }
}
