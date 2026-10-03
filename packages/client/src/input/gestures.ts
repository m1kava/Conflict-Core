export type GestureType =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'holdEnd'
  | 'panStart'
  | 'pan'
  | 'panEnd'
  | 'boxUpdate'
  | 'boxEnd'
  | 'boxCancel'
  | 'twoFinger'
  | 'twoFingerEnd';

export interface Gesture {
  type: GestureType;
  x: number;
  y: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  scale: number;
  rotation: number;
}

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

const TAP_SLOP = 10;
const MAX_TAP_MS = 300;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 30;
const LONG_PRESS_MS = 450;
const VELOCITY_SMOOTHING = 0.35;

type Mode = 'idle' | 'pending' | 'panning' | 'held' | 'boxing' | 'twoFinger' | 'waitRelease';

/**
 * Touch gesture recognizer for RTS controls (pure logic, no DOM): one-finger pan with release velocity, tap,
 * double tap, long press, long-press-then-drag box selection, and two-finger pinch/twist/pan. After a
 * two-finger gesture, remaining fingers are ignored until all lift, so pinches never end in accidental taps.
 */
export class GestureRecognizer {
  private mode: Mode = 'idle';
  private readonly touches = new Map<number, TouchPoint>();
  private primary = -1;
  private secondary = -1;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private startTime = 0;
  private lastTime = 0;
  private vx = 0;
  private vy = 0;
  private pinchDistance = 0;
  private pinchAngle = 0;
  private centroidX = 0;
  private centroidY = 0;
  private lastTapTime = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  constructor(
    private readonly emit: (gesture: Gesture) => void,
    private readonly pixelScale = 1,
  ) {}

  down(point: TouchPoint, time: number): void {
    this.touches.set(point.id, point);
    if (this.touches.size >= 2 && (this.mode === 'idle' || this.mode === 'pending' || this.mode === 'panning' || this.mode === 'held' || this.mode === 'boxing')) {
      this.beginTwoFinger();
      return;
    }
    if (this.mode === 'idle' && this.touches.size === 1) {
      this.mode = 'pending';
      this.primary = point.id;
      this.startX = this.lastX = point.x;
      this.startY = this.lastY = point.y;
      this.startTime = this.lastTime = time;
      this.vx = this.vy = 0;
    }
  }

  move(point: TouchPoint, time: number): void {
    if (!this.touches.has(point.id)) {
      return;
    }
    this.touches.set(point.id, point);
    if (this.mode === 'twoFinger') {
      this.updateTwoFinger();
      return;
    }
    if (point.id !== this.primary) {
      return;
    }
    const slop = TAP_SLOP * this.pixelScale;
    switch (this.mode) {
      case 'pending':
        if (Math.hypot(point.x - this.startX, point.y - this.startY) > slop) {
          this.mode = 'panning';
          this.emitGesture('panStart', point.x, point.y);
          this.emitGesture('pan', point.x, point.y, point.x - this.startX, point.y - this.startY);
          this.lastX = point.x;
          this.lastY = point.y;
          this.lastTime = time;
        }
        break;
      case 'panning': {
        const dt = (time - this.lastTime) / 1000;
        const dx = point.x - this.lastX;
        const dy = point.y - this.lastY;
        if (dt > 0) {
          this.vx += (dx / dt - this.vx) * VELOCITY_SMOOTHING;
          this.vy += (dy / dt - this.vy) * VELOCITY_SMOOTHING;
        }
        if (dx !== 0 || dy !== 0) {
          this.emitGesture('pan', point.x, point.y, dx, dy);
        }
        this.lastX = point.x;
        this.lastY = point.y;
        this.lastTime = time;
        break;
      }
      case 'held':
        if (Math.hypot(point.x - this.startX, point.y - this.startY) > slop) {
          this.mode = 'boxing';
          this.emitGesture('boxUpdate', point.x, point.y);
        }
        break;
      case 'boxing':
        this.emitGesture('boxUpdate', point.x, point.y);
        break;
    }
  }

  up(id: number, time: number, cancelled = false): void {
    const point = this.touches.get(id);
    this.touches.delete(id);
    if (!point) {
      return;
    }
    if (this.mode === 'twoFinger') {
      if (id === this.primary || id === this.secondary) {
        this.emitGesture('twoFingerEnd', this.centroidX, this.centroidY);
        this.mode = this.touches.size > 0 ? 'waitRelease' : 'idle';
      }
      return;
    }
    if (this.mode === 'waitRelease') {
      if (this.touches.size === 0) {
        this.mode = 'idle';
      }
      return;
    }
    if (id !== this.primary) {
      return;
    }
    switch (this.mode) {
      case 'pending':
        if (!cancelled && time - this.startTime <= MAX_TAP_MS) {
          this.emitTap(point.x, point.y, time);
        }
        break;
      case 'panning': {
        // A finger that stopped before lifting should not fling the camera.
        const idle = time - this.lastTime > 80;
        this.vx = cancelled || idle ? 0 : this.vx;
        this.vy = cancelled || idle ? 0 : this.vy;
        this.emitGesture('panEnd', point.x, point.y, 0, 0, this.vx, this.vy);
        break;
      }
      case 'boxing':
        this.emitGesture(cancelled ? 'boxCancel' : 'boxEnd', point.x, point.y);
        break;
      case 'held':
        if (!cancelled) {
          this.emitGesture('holdEnd', this.startX, this.startY);
        }
        break;
    }
    this.mode = 'idle';
  }

  /** Must be called every frame: long presses fire on time, not on movement. */
  tick(time: number): void {
    if (this.mode === 'pending' && time - this.startTime >= LONG_PRESS_MS) {
      this.mode = 'held';
      this.lastTapTime = -Infinity;
      this.emitGesture('longPress', this.startX, this.startY);
    }
  }

  reset(): void {
    this.touches.clear();
    this.mode = 'idle';
  }

  private emitTap(x: number, y: number, time: number): void {
    const isDouble = time - this.lastTapTime <= DOUBLE_TAP_MS && Math.hypot(x - this.lastTapX, y - this.lastTapY) <= DOUBLE_TAP_SLOP * this.pixelScale;
    if (isDouble) {
      this.lastTapTime = -Infinity;
      this.emitGesture('doubleTap', x, y);
      return;
    }
    this.lastTapTime = time;
    this.lastTapX = x;
    this.lastTapY = y;
    this.emitGesture('tap', x, y);
  }

  private beginTwoFinger(): void {
    if (this.mode === 'panning') {
      this.emitGesture('panEnd', this.lastX, this.lastY);
    } else if (this.mode === 'boxing') {
      this.emitGesture('boxCancel', this.lastX, this.lastY);
    }
    const [a, b] = [...this.touches.values()];
    this.primary = a!.id;
    this.secondary = b!.id;
    const m = this.measure(a!, b!);
    this.pinchDistance = m.distance;
    this.pinchAngle = m.angle;
    this.centroidX = m.cx;
    this.centroidY = m.cy;
    this.mode = 'twoFinger';
  }

  private updateTwoFinger(): void {
    const a = this.touches.get(this.primary);
    const b = this.touches.get(this.secondary);
    if (!a || !b) {
      return;
    }
    const m = this.measure(a, b);
    const scale = this.pinchDistance > 1 ? m.distance / this.pinchDistance : 1;
    let rotation = m.angle - this.pinchAngle;
    if (rotation > Math.PI) rotation -= Math.PI * 2;
    if (rotation < -Math.PI) rotation += Math.PI * 2;
    this.emit({ type: 'twoFinger', x: m.cx, y: m.cy, startX: m.cx, startY: m.cy, dx: m.cx - this.centroidX, dy: m.cy - this.centroidY, vx: 0, vy: 0, scale, rotation });
    this.pinchDistance = m.distance;
    this.pinchAngle = m.angle;
    this.centroidX = m.cx;
    this.centroidY = m.cy;
  }

  private measure(a: TouchPoint, b: TouchPoint): { distance: number; angle: number; cx: number; cy: number } {
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  private emitGesture(type: GestureType, x: number, y: number, dx = 0, dy = 0, vx = 0, vy = 0): void {
    this.emit({ type, x, y, startX: this.startX, startY: this.startY, dx, dy, vx, vy, scale: 1, rotation: 0 });
  }
}
