import * as THREE from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  endSize?: number;
  color: THREE.Color;
  endColor?: THREE.Color;
  alpha?: number;
  endAlpha?: number;
  gravity?: number;
  drag?: number;
}

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec4 vColor;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor.rgb * tex.rgb, vColor.a * tex.a);
    if (gl_FragColor.a < 0.01) discard;
  }
`;

/**
 * Fixed-capacity CPU particle layer drawn as one Points object (one draw call). Particles are stored in
 * flat typed arrays and removed by swap-with-last, so spawning and updating never allocate.
 */
export class ParticleLayer {
  readonly points: THREE.Points;
  private readonly position: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Float32Array;
  private readonly velocity: Float32Array;
  private readonly data: Float32Array;
  private readonly startColor: Float32Array;
  private readonly endColor: Float32Array;
  private count = 0;
  private readonly material: THREE.ShaderMaterial;
  private static readonly STRIDE = 7; // life, maxLife, size0, size1, gravity, drag, unused

  constructor(
    readonly capacity: number,
    texture: THREE.Texture,
    additive: boolean,
  ) {
    this.position = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 4);
    this.velocity = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * ParticleLayer.STRIDE);
    this.startColor = new Float32Array(capacity * 4);
    this.endColor = new Float32Array(capacity * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uMap: { value: texture }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  setViewportScale(heightPixels: number, fovDegrees: number): void {
    this.material.uniforms['uScale']!.value = heightPixels / (2 * Math.tan((fovDegrees * Math.PI) / 360));
  }

  spawn(spec: ParticleSpec): void {
    if (this.count >= this.capacity) {
      return;
    }
    const i = this.count++;
    const p = i * 3;
    this.position[p] = spec.x;
    this.position[p + 1] = spec.y;
    this.position[p + 2] = spec.z;
    this.velocity[p] = spec.vx ?? 0;
    this.velocity[p + 1] = spec.vy ?? 0;
    this.velocity[p + 2] = spec.vz ?? 0;
    const d = i * ParticleLayer.STRIDE;
    this.data[d] = 0;
    this.data[d + 1] = spec.life;
    this.data[d + 2] = spec.size;
    this.data[d + 3] = spec.endSize ?? spec.size;
    this.data[d + 4] = spec.gravity ?? 0;
    this.data[d + 5] = spec.drag ?? 0;
    const end = spec.endColor ?? spec.color;
    const c = i * 4;
    this.startColor[c] = spec.color.r;
    this.startColor[c + 1] = spec.color.g;
    this.startColor[c + 2] = spec.color.b;
    this.startColor[c + 3] = spec.alpha ?? 1;
    this.endColor[c] = end.r;
    this.endColor[c + 1] = end.g;
    this.endColor[c + 2] = end.b;
    this.endColor[c + 3] = spec.endAlpha ?? 0;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      const d = i * ParticleLayer.STRIDE;
      const life = (this.data[d] ?? 0) + dt;
      const maxLife = this.data[d + 1] ?? 1;
      if (life >= maxLife) {
        this.remove(i);
        continue;
      }
      this.data[d] = life;
      const t = life / maxLife;
      const drag = Math.max(0, 1 - (this.data[d + 5] ?? 0) * dt);
      const p = i * 3;
      this.velocity[p] = (this.velocity[p] ?? 0) * drag;
      this.velocity[p + 1] = ((this.velocity[p + 1] ?? 0) - (this.data[d + 4] ?? 0) * dt) * drag;
      this.velocity[p + 2] = (this.velocity[p + 2] ?? 0) * drag;
      this.position[p] = (this.position[p] ?? 0) + (this.velocity[p] ?? 0) * dt;
      this.position[p + 1] = (this.position[p + 1] ?? 0) + (this.velocity[p + 1] ?? 0) * dt;
      this.position[p + 2] = (this.position[p + 2] ?? 0) + (this.velocity[p + 2] ?? 0) * dt;
      this.size[i] = (this.data[d + 2] ?? 1) + ((this.data[d + 3] ?? 1) - (this.data[d + 2] ?? 1)) * t;
      const c = i * 4;
      for (let k = 0; k < 4; k++) {
        this.color[c + k] = (this.startColor[c + k] ?? 0) + ((this.endColor[c + k] ?? 0) - (this.startColor[c + k] ?? 0)) * t;
      }
      i++;
    }
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, this.count);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('aSize').needsUpdate = true;
    geometry.getAttribute('aColor').needsUpdate = true;
  }

  get active(): number {
    return this.count;
  }

  private remove(i: number): void {
    const last = --this.count;
    if (i === last) {
      return;
    }
    this.position.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.velocity.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.size[i] = this.size[last] ?? 0;
    this.color.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.startColor.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.endColor.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.data.copyWithin(i * ParticleLayer.STRIDE, last * ParticleLayer.STRIDE, (last + 1) * ParticleLayer.STRIDE);
  }
}
