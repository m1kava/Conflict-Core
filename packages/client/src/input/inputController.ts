import { GestureRecognizer, type Gesture } from './gestures';
import type { RtsCamera } from './rtsCamera';

export interface InputTarget {
  readonly camera: RtsCamera;
  viewport(): { width: number; height: number };
  /** Left click / tap. */
  primaryAt(x: number, y: number, options: { additive: boolean; touch: boolean }): void;
  /** Right click: context command (move / attack / harvest / repair). */
  contextAt(x: number, y: number, queue: boolean): void;
  selectSameType(x: number, y: number): void;
  boxSelect(x0: number, y0: number, x1: number, y1: number, additive: boolean): void;
  /** Touch: finger held still then released — attack-move there. */
  holdRelease(x: number, y: number): void;
  hover(x: number, y: number): void;
  setBox(box: { x0: number; y0: number; x1: number; y1: number } | null): void;
  /** Returns true if the key was handled. */
  key(event: KeyboardEvent): boolean;
  userGesture(): void;
}

const DRAG_THRESHOLD = 6;
const DOUBLE_CLICK_MS = 300;
const EDGE_SIZE = 6;
const KEY_PAN_SPEED = 1.1;

/**
 * Translates browser input into RTS actions. Mouse: left-click select, drag box, double-click same type,
 * right-click context order, right-drag pan, middle-drag rotate, wheel zoom, edge/keyboard scrolling.
 * Touch: gestures (tap, double tap, hold, hold+drag box, one-finger pan, pinch/twist).
 */
export class InputController {
  edgeScroll = true;
  private readonly gestures: GestureRecognizer;
  private readonly keys = new Set<string>();
  private mouse: { x: number; y: number; button: number; dragging: boolean; lastX: number; lastY: number } | null = null;
  private pointerX = -1;
  private pointerY = -1;
  private pointerInside = false;
  private lastClick = { time: 0, x: 0, y: 0 };
  private heldAt: { x: number; y: number } | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly target: InputTarget,
  ) {
    this.gestures = new GestureRecognizer((g) => this.onGesture(g), Math.max(1, (window.devicePixelRatio || 1) / 2));
    this.listen(element, 'pointerdown', (e) => this.pointerDown(e as PointerEvent));
    this.listen(window, 'pointermove', (e) => this.pointerMove(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.pointerUp(e as PointerEvent));
    this.listen(window, 'pointercancel', (e) => this.pointerUp(e as PointerEvent, true));
    this.listen(element, 'wheel', (e) => this.wheel(e as WheelEvent), { passive: false });
    this.listen(element, 'contextmenu', (e) => e.preventDefault());
    this.listen(element, 'pointerenter', () => (this.pointerInside = true));
    this.listen(element, 'pointerleave', () => (this.pointerInside = false));
    this.listen(window, 'keydown', (e) => this.keyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => {
      this.keys.clear();
      this.gestures.reset();
      this.mouse = null;
    });
  }

  update(dt: number): void {
    this.gestures.tick(performance.now());
    const camera = this.target.camera;
    let right = 0;
    let up = 0;
    if (this.keys.has('ArrowUp')) up += 1;
    if (this.keys.has('ArrowDown')) up -= 1;
    if (this.keys.has('ArrowLeft')) right -= 1;
    if (this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyQ')) camera.rotate(-dt * 1.6);
    if (this.keys.has('KeyE')) camera.rotate(dt * 1.6);
    const { width, height } = this.target.viewport();
    if (this.edgeScroll && this.pointerInside && !this.mouse && document.hasFocus()) {
      if (this.pointerX >= 0 && this.pointerX < EDGE_SIZE) right -= 1;
      if (this.pointerX > width - EDGE_SIZE) right += 1;
      if (this.pointerY >= 0 && this.pointerY < EDGE_SIZE) up += 1;
      if (this.pointerY > height - EDGE_SIZE) up -= 1;
    }
    if (right !== 0 || up !== 0) {
      camera.nudge(right * KEY_PAN_SPEED, up * KEY_PAN_SPEED, dt);
    }
  }

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  private local(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private pointerDown(event: PointerEvent): void {
    this.target.userGesture();
    const point = this.local(event);
    if (event.pointerType === 'touch') {
      event.preventDefault();
      this.gestures.down({ id: event.pointerId, x: point.x, y: point.y }, performance.now());
      return;
    }
    this.element.setPointerCapture?.(event.pointerId);
    this.mouse = { x: point.x, y: point.y, button: event.button, dragging: false, lastX: point.x, lastY: point.y };
    this.target.camera.stop();
  }

  private pointerMove(event: PointerEvent): void {
    const point = this.local(event);
    if (event.pointerType === 'touch') {
      this.gestures.move({ id: event.pointerId, x: point.x, y: point.y }, performance.now());
      return;
    }
    this.pointerX = point.x;
    this.pointerY = point.y;
    const mouse = this.mouse;
    if (!mouse) {
      this.target.hover(point.x, point.y);
      return;
    }
    if (!mouse.dragging && Math.hypot(point.x - mouse.x, point.y - mouse.y) > DRAG_THRESHOLD) {
      mouse.dragging = true;
    }
    if (mouse.dragging) {
      const { height } = this.target.viewport();
      if (mouse.button === 0) {
        this.target.setBox({ x0: mouse.x, y0: mouse.y, x1: point.x, y1: point.y });
      } else if (mouse.button === 2) {
        this.target.camera.pan(point.x - mouse.lastX, point.y - mouse.lastY, height);
      } else if (mouse.button === 1) {
        this.target.camera.rotate((point.x - mouse.lastX) * 0.008);
      }
    }
    mouse.lastX = point.x;
    mouse.lastY = point.y;
  }

  private pointerUp(event: PointerEvent, cancelled = false): void {
    const point = this.local(event);
    if (event.pointerType === 'touch') {
      this.gestures.up(event.pointerId, performance.now(), cancelled);
      return;
    }
    const mouse = this.mouse;
    this.mouse = null;
    if (!mouse || cancelled) {
      this.target.setBox(null);
      return;
    }
    if (mouse.button === 0) {
      if (mouse.dragging) {
        this.target.setBox(null);
        this.target.boxSelect(mouse.x, mouse.y, point.x, point.y, event.shiftKey);
        return;
      }
      const now = performance.now();
      const isDouble = now - this.lastClick.time < DOUBLE_CLICK_MS && Math.hypot(point.x - this.lastClick.x, point.y - this.lastClick.y) < 8;
      this.lastClick = { time: isDouble ? 0 : now, x: point.x, y: point.y };
      if (isDouble) {
        this.target.selectSameType(point.x, point.y);
      } else {
        this.target.primaryAt(point.x, point.y, { additive: event.shiftKey, touch: false });
      }
    } else if (mouse.button === 2 && !mouse.dragging) {
      this.target.contextAt(point.x, point.y, event.shiftKey);
    }
  }

  private wheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY;
    this.target.camera.zoomBy(Math.exp(-delta * 0.0016));
  }

  private keyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    if (this.target.key(event)) {
      event.preventDefault();
      return;
    }
    this.keys.add(event.code);
  }

  private onGesture(gesture: Gesture): void {
    const camera = this.target.camera;
    const { height } = this.target.viewport();
    switch (gesture.type) {
      case 'tap':
        this.target.primaryAt(gesture.x, gesture.y, { additive: false, touch: true });
        break;
      case 'doubleTap':
        this.target.selectSameType(gesture.x, gesture.y);
        break;
      case 'longPress':
        this.heldAt = { x: gesture.x, y: gesture.y };
        navigator.vibrate?.(12);
        break;
      case 'panStart':
        camera.stop();
        break;
      case 'pan':
        camera.pan(gesture.dx, gesture.dy, height);
        break;
      case 'panEnd':
        camera.release(gesture.vx, gesture.vy, height);
        break;
      case 'boxUpdate':
        this.heldAt = null;
        this.target.setBox({ x0: gesture.startX, y0: gesture.startY, x1: gesture.x, y1: gesture.y });
        break;
      case 'boxEnd':
        this.target.setBox(null);
        this.target.boxSelect(gesture.startX, gesture.startY, gesture.x, gesture.y, false);
        break;
      case 'boxCancel':
        this.target.setBox(null);
        break;
      case 'twoFinger':
        this.heldAt = null;
        camera.zoomBy(gesture.scale);
        camera.rotate(-gesture.rotation);
        camera.pan(gesture.dx, gesture.dy, height);
        break;
      case 'holdEnd':
        this.releaseHold();
        break;
      case 'twoFingerEnd':
        break;
    }
    if (gesture.type === 'tap' || gesture.type === 'panStart') {
      this.heldAt = null;
    }
  }

  /** A held finger lifted without dragging: attack-move to where it was held. */
  private releaseHold(): void {
    if (this.heldAt) {
      this.target.holdRelease(this.heldAt.x, this.heldAt.y);
      this.heldAt = null;
    }
  }
}
