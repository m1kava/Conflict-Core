import * as THREE from 'three';
import type { Terrain } from '@conflict/shared';
import { groundHeight } from '../render/bridge';

const MIN_DISTANCE = 26;
const MAX_DISTANCE = 175;
const MIN_PITCH = (38 * Math.PI) / 180;
const MAX_PITCH = (62 * Math.PI) / 180;
const FOV = 40;
const INERTIA_DAMPING = 5;
const SMOOTHING = 14;
const MAX_INERTIA_SCREENS = 2.5;

/**
 * RTS camera: a ground focus point, heading (yaw), and a zoom level that sets both distance and pitch
 * (closer = flatter, more cinematic). Panning is locked to the finger/mouse, releases glide with inertia,
 * zoom and rotation are smoothed, and the focus is clamped to the map.
 */
export class RtsCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1200);
  focusX: number;
  focusY: number;
  yaw = 0;
  sensitivity = 1;
  rotationEnabled = true;
  private zoom = 0.35;
  private targetZoom = 0.35;
  private targetYaw = 0;
  private velocityX = 0;
  private velocityY = 0;
  private focusHeight = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly terrain: Terrain,
    startX: number,
    startY: number,
    startYaw: number,
  ) {
    this.focusX = startX;
    this.focusY = startY;
    this.yaw = startYaw;
    this.targetYaw = startYaw;
    this.focusHeight = groundHeight(terrain, startX, startY);
    this.apply();
  }

  get distance(): number {
    return MIN_DISTANCE + (MAX_DISTANCE - MIN_DISTANCE) * this.zoom;
  }

  get pitch(): number {
    return MIN_PITCH + (MAX_PITCH - MIN_PITCH) * this.zoom;
  }

  /** Metres of ground spanned by the viewport height at the focus point. */
  visibleGroundHeight(): number {
    return 2 * this.distance * Math.tan((FOV * Math.PI) / 360);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Drag by a screen delta in pixels (positive dy = finger moved down). */
  pan(dx: number, dy: number, viewportHeight: number): void {
    this.velocityX = 0;
    this.velocityY = 0;
    const [mx, my] = this.screenToGroundDelta(dx, dy, viewportHeight);
    this.focusX += mx;
    this.focusY += my;
    this.clamp();
  }

  /** Continuous pan (keyboard / screen edge) in screen-relative directions, units: screens per second. */
  nudge(right: number, up: number, dt: number): void {
    const span = this.visibleGroundHeight() * 0.9 * dt * this.sensitivity;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.focusX += (cos * right + sin * up) * span;
    this.focusY += (-sin * right + cos * up) * span;
    this.clamp();
  }

  release(vx: number, vy: number, viewportHeight: number): void {
    const [mx, my] = this.screenToGroundDelta(vx, vy, viewportHeight);
    const max = this.visibleGroundHeight() * MAX_INERTIA_SCREENS;
    const speed = Math.hypot(mx, my);
    const scale = speed > max ? max / speed : 1;
    this.velocityX = mx * scale;
    this.velocityY = my * scale;
  }

  stop(): void {
    this.velocityX = 0;
    this.velocityY = 0;
  }

  /** factor > 1 zooms in. */
  zoomBy(factor: number): void {
    if (!(factor > 0)) {
      return;
    }
    const distance = MIN_DISTANCE + (MAX_DISTANCE - MIN_DISTANCE) * this.targetZoom;
    const next = distance / factor;
    this.targetZoom = Math.min(1, Math.max(0, (next - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE)));
  }

  rotate(radians: number): void {
    if (this.rotationEnabled) {
      this.targetYaw += radians;
    }
  }

  resetRotation(): void {
    this.targetYaw = Math.round(this.targetYaw / (Math.PI * 2)) * Math.PI * 2;
  }

  jumpTo(x: number, y: number): void {
    this.focusX = x;
    this.focusY = y;
    this.stop();
    this.clamp();
  }

  update(dt: number): void {
    if (this.velocityX !== 0 || this.velocityY !== 0) {
      this.focusX += this.velocityX * dt;
      this.focusY += this.velocityY * dt;
      const decay = Math.exp(-INERTIA_DAMPING * dt);
      this.velocityX *= decay;
      this.velocityY *= decay;
      if (Math.hypot(this.velocityX, this.velocityY) < 0.05) {
        this.stop();
      }
      this.clamp();
    }
    const blend = 1 - Math.exp(-SMOOTHING * dt);
    this.zoom += (this.targetZoom - this.zoom) * blend;
    this.yaw += (this.targetYaw - this.yaw) * blend;
    this.focusHeight += (groundHeight(this.terrain, this.focusX, this.focusY) - this.focusHeight) * blend;
    this.apply();
  }

  /** Ground point (sim coordinates) under a screen position, by marching the view ray against terrain. */
  screenToGround(sx: number, sy: number, width: number, height: number): { x: number; y: number } | null {
    this.ndc.set((sx / width) * 2 - 1, -(sy / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    let previous = 0;
    for (let t = 0; t < 1200; t += 2) {
      const x = origin.x + direction.x * t;
      const z = origin.z + direction.z * t;
      const y = origin.y + direction.y * t;
      if (y <= groundHeight(this.terrain, x, -z)) {
        let lo = previous;
        let hi = t;
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          const my = origin.y + direction.y * mid;
          if (my <= groundHeight(this.terrain, origin.x + direction.x * mid, -(origin.z + direction.z * mid))) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        return { x: origin.x + direction.x * hi, y: -(origin.z + direction.z * hi) };
      }
      previous = t;
    }
    return null;
  }

  /** Four ground corners of the view (for the minimap frustum outline). */
  viewCorners(width: number, height: number): { x: number; y: number }[] {
    const corners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ] as const;
    return corners.map(([sx, sy]) => this.screenToGround(sx, sy, width, height) ?? { x: this.focusX, y: this.focusY });
  }

  private screenToGroundDelta(dx: number, dy: number, viewportHeight: number): [number, number] {
    const metresPerPixel = (this.visibleGroundHeight() / Math.max(1, viewportHeight)) * this.sensitivity;
    const stretch = 1 / Math.max(0.3, Math.sin(this.pitch));
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Content follows the pointer: dragging right moves the focus left; dragging down moves it forward.
    const right = -dx * metresPerPixel;
    const forward = dy * metresPerPixel * stretch;
    return [cos * right + sin * forward, -sin * right + cos * forward];
  }

  private clamp(): void {
    const map = this.terrain.map;
    this.focusX = Math.min(map.width - 8, Math.max(8, this.focusX));
    this.focusY = Math.min(map.height - 8, Math.max(8, this.focusY));
  }

  private apply(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const camX = this.focusX - sin * horizontal;
    const camY = this.focusY - cos * horizontal;
    this.camera.position.set(camX, this.focusHeight + vertical, -camY);
    this.camera.lookAt(this.focusX, this.focusHeight, -this.focusY);
  }
}
