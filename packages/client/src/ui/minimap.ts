import { type Terrain } from '@conflict/shared';
import type { ClientWorld } from '../game/clientWorld';
import { TEAM_COLORS } from '../render/models/palette';
import { h } from './dom';

const SIZE = 256;

export interface MinimapActions {
  jump(x: number, y: number): void;
  command(x: number, y: number): void;
}

/**
 * Tactical minimap: pre-rendered terrain, fog of war, structures and units, camera view outline and alert
 * pings. Enemy contacts appear only while the player has a powered radar. Click/tap jumps the camera,
 * right-click issues a move order there.
 */
export class Minimap {
  readonly element: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly offline: HTMLElement;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogImage: ImageData;
  private readonly pings: { x: number; y: number; time: number }[] = [];
  private dragging = false;

  constructor(
    private readonly terrain: Terrain,
    private readonly actions: MinimapActions,
  ) {
    this.canvas = h('canvas', { width: SIZE, height: SIZE, 'aria-label': 'Minimap' });
    this.ctx = this.canvas.getContext('2d')!;
    this.offline = h('div', { class: 'offline' }, 'Radar offline');
    this.element = h('div', { class: 'panel minimap' }, this.canvas, this.offline);
    this.background = this.renderBackground();
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = Math.ceil(terrain.map.width / 4);
    this.fogCanvas.height = Math.ceil(terrain.map.height / 4);
    this.fogImage = this.fogCanvas.getContext('2d')!.createImageData(this.fogCanvas.width, this.fogCanvas.height);
    this.bindInput();
  }

  ping(x: number, y: number): void {
    this.pings.push({ x, y, time: performance.now() });
  }

  draw(world: ClientWorld, hasRadar: boolean, viewCorners: { x: number; y: number }[]): void {
    const ctx = this.ctx;
    const map = this.terrain.map;
    const sx = SIZE / map.width;
    const sy = SIZE / map.height;
    ctx.drawImage(this.background, 0, 0);

    const data = this.fogImage.data;
    for (let i = 0; i < world.fog.length; i++) {
      const value = world.fog[i];
      // Fog grid rows run south→north; canvas rows run top→bottom (north first).
      const fx = i % world.fogWidth;
      const fy = world.fogHeight - 1 - Math.floor(i / world.fogWidth);
      const o = (fy * world.fogWidth + fx) * 4;
      data[o] = 4;
      data[o + 1] = 7;
      data[o + 2] = 9;
      data[o + 3] = value === 2 ? 0 : value === 1 ? 110 : 225;
    }
    this.fogCanvas.getContext('2d')!.putImageData(this.fogImage, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogCanvas, 0, 0, SIZE, SIZE);

    for (const entity of world.entities.values()) {
      const x = entity.x * sx;
      const y = SIZE - entity.y * sy;
      if (entity.kind === 'resource') {
        ctx.fillStyle = '#f2d35d';
        ctx.fillRect(x - 2, y - 2, 4, 4);
        continue;
      }
      const own = world.isAlly(entity.owner);
      if (!own && !hasRadar && !entity.ghost) {
        continue;
      }
      ctx.fillStyle = `#${(TEAM_COLORS[entity.owner] ?? 0xffffff).toString(16).padStart(6, '0')}`;
      if (entity.kind === 'building') {
        const w = Math.max(4, (entity.buildingDef?.width ?? 8) * sx);
        const d = Math.max(4, (entity.buildingDef?.depth ?? 8) * sy);
        ctx.globalAlpha = entity.ghost ? 0.5 : 1;
        ctx.fillRect(x - w / 2, y - d / 2, w, d);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }

    if (viewCorners.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      viewCorners.forEach((corner, i) => {
        const px = Math.max(0, Math.min(SIZE, corner.x * sx));
        const py = Math.max(0, Math.min(SIZE, SIZE - corner.y * sy));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.stroke();
    }

    const now = performance.now();
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i]!;
      const age = (now - ping.time) / 1000;
      if (age > 3) {
        this.pings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(255,90,74,${1 - age / 3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x * sx, SIZE - ping.y * sy, 4 + (age % 1) * 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.offline.style.display = hasRadar ? 'none' : 'flex';
    this.offline.textContent = hasRadar ? '' : 'No radar · enemy contacts hidden';
  }

  private renderBackground(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(SIZE, SIZE);
    const map = this.terrain.map;
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const x = ((px + 0.5) / SIZE) * map.width;
        const y = ((SIZE - py - 0.5) / SIZE) * map.height;
        const height = this.terrain.heightAt(x, y);
        let r: number;
        let g: number;
        let b: number;
        if (this.terrain.isDeepWater(x, y)) {
          [r, g, b] = [44, 74, 82];
        } else if (this.terrain.slopeAt(x, y) > 0.85) {
          [r, g, b] = [96, 92, 86];
        } else {
          const shade = 0.75 + height * 0.035;
          [r, g, b] = [96 * shade, 104 * shade, 70 * shade];
        }
        const o = (py * SIZE + px) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = 'rgba(160,140,100,0.55)';
    ctx.lineWidth = 2;
    for (const road of map.roads) {
      ctx.beginPath();
      road.forEach((p, i) => {
        const px = (p.x / map.width) * SIZE;
        const py = SIZE - (p.y / map.height) * SIZE;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    return canvas;
  }

  private toWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const map = this.terrain.map;
    return {
      x: ((event.clientX - rect.left) / rect.width) * map.width,
      y: (1 - (event.clientY - rect.top) / rect.height) * map.height,
    };
  }

  private bindInput(): void {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const point = this.toWorld(event);
      if (event.button === 2) {
        this.actions.command(point.x, point.y);
        return;
      }
      this.dragging = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.actions.jump(point.x, point.y);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.dragging) {
        const point = this.toWorld(event);
        this.actions.jump(point.x, point.y);
      }
    });
    const stop = (): void => {
      this.dragging = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }
}
