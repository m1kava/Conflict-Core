export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  level: QualityLevel;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  terrainCellSize: number;
  vegetationDensity: number;
  maxParticles: number;
  explosionLights: boolean;
}

/** Rendering presets. Every value that trades quality for speed lives here. */
export function qualityProfile(level: QualityLevel): QualityProfile {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  switch (level) {
    case 'low':
      return { level, pixelRatio: Math.min(dpr, 1) * 0.75, antialias: false, shadows: false, shadowMapSize: 512, terrainCellSize: 4, vegetationDensity: 0.35, maxParticles: 900, explosionLights: false };
    case 'medium':
      return { level, pixelRatio: Math.min(dpr, 1.25), antialias: false, shadows: true, shadowMapSize: 1024, terrainCellSize: 2, vegetationDensity: 0.6, maxParticles: 1800, explosionLights: false };
    case 'high':
      return { level, pixelRatio: Math.min(dpr, 1.75), antialias: true, shadows: true, shadowMapSize: 2048, terrainCellSize: 2, vegetationDensity: 0.85, maxParticles: 3000, explosionLights: true };
    case 'ultra':
      return { level, pixelRatio: Math.min(dpr, 2.5), antialias: true, shadows: true, shadowMapSize: 4096, terrainCellSize: 1, vegetationDensity: 1, maxParticles: 5000, explosionLights: true };
  }
}

/** Conservative default: phones and low-memory devices start lower; players can change it in settings. */
export function detectQuality(): QualityLevel {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = matchMedia('(pointer: coarse)').matches;
  const memory = nav.deviceMemory ?? 4;
  const cores = nav.hardwareConcurrency ?? 4;
  if (memory <= 2 || cores <= 2) {
    return 'low';
  }
  if (touch) {
    return memory >= 6 && cores >= 8 ? 'high' : 'medium';
  }
  return memory >= 8 && cores >= 8 ? 'ultra' : 'high';
}
