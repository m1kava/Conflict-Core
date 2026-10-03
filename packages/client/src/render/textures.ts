import * as THREE from 'three';
import { fractalNoise } from '@conflict/shared';

function canvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d')!;
  return { canvas: element, ctx, image: ctx.createImageData(size, size) };
}

function tiledNoise(x: number, y: number, size: number, frequency: number, seed: number, octaves: number): number {
  // Blend four offset samples so the texture tiles seamlessly.
  const u = x / size;
  const v = y / size;
  const a = fractalNoise(x * frequency, y * frequency, seed, octaves);
  const b = fractalNoise((x - size) * frequency, y * frequency, seed, octaves);
  const c = fractalNoise(x * frequency, (y - size) * frequency, seed, octaves);
  const d = fractalNoise((x - size) * frequency, (y - size) * frequency, seed, octaves);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Seamless grayscale detail texture (used as albedo variation and bump). */
export function detailTexture(size: number, seed: number, frequency: number, contrast: number, octaves = 4): THREE.CanvasTexture {
  const { canvas: element, ctx, image } = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = tiledNoise(x, y, size, frequency, seed, octaves);
      const value = Math.max(0, Math.min(255, 255 * (0.78 + (n - 0.5) * contrast)));
      const i = (y * size + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Weathered paint: subtle mottling, panel seams and grime, used on vehicles. */
export function panelTexture(size: number, seed: number): THREE.CanvasTexture {
  const { canvas: element, ctx, image } = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mottle = tiledNoise(x, y, size, 0.03, seed, 3);
      const grime = tiledNoise(x, y, size, 0.12, seed + 7, 2);
      let value = 0.86 + (mottle - 0.5) * 0.22 - Math.max(0, grime - 0.62) * 0.6;
      if (x % (size / 4) < 1 || y % (size / 2) < 1) {
        value -= 0.18; // panel seams
      }
      const v = Math.max(0, Math.min(255, value * 255));
      const i = (y * size + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft round sprite (white with radial alpha) for particles and glows. */
export function radialTexture(size = 64, hardness = 0.0): THREE.CanvasTexture {
  const { canvas: element, ctx } = canvas(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(Math.min(0.95, 0.3 + hardness), 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(element);
}

/** Billowy smoke puff with noisy edges. */
export function smokeTexture(size = 128, seed = 3): THREE.CanvasTexture {
  const { canvas: element, ctx, image } = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = fractalNoise(x * 0.06, y * 0.06, seed, 4);
      const alpha = Math.max(0, 1 - r * (1.15 - (n - 0.5) * 0.9));
      const i = (y * size + x) * 4;
      const shade = 200 + n * 55;
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = Math.pow(alpha, 1.4) * 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(element);
}

/** Scorch mark decal: dark burnt centre fading out. */
export function scorchTexture(size = 128): THREE.CanvasTexture {
  const { canvas: element, ctx, image } = canvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = fractalNoise(x * 0.08, y * 0.08, 11, 3);
      const alpha = Math.max(0, Math.min(1, (1 - r) * 1.6 - (n - 0.5) * 0.8));
      const i = (y * size + x) * 4;
      image.data[i] = 18;
      image.data[i + 1] = 15;
      image.data[i + 2] = 12;
      image.data[i + 3] = alpha * 220;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(element);
}
