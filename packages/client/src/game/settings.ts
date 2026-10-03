import type { QualityLevel } from '../render/quality';
import { detectQuality } from '../render/quality';

export interface Settings {
  name: string;
  quality: QualityLevel;
  cameraSensitivity: number;
  cameraRotation: boolean;
  edgeScroll: boolean;
  volume: number;
  showPerformance: boolean;
  showAllHealthBars: boolean;
}

const KEY = 'conflict.settings';

function defaults(): Settings {
  return {
    name: `Commander${Math.floor(100 + Math.random() * 900)}`,
    quality: detectQuality(),
    cameraSensitivity: 1,
    cameraRotation: true,
    edgeScroll: true,
    volume: 0.7,
    showPerformance: false,
    showAllHealthBars: false,
  };
}

/** Per-browser preferences in localStorage (never gameplay state). Survives missing/blocked storage. */
export function loadSettings(): Settings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return base;
    }
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...base,
      ...parsed,
      quality: ['low', 'medium', 'high', 'ultra'].includes(parsed.quality ?? '') ? (parsed.quality as QualityLevel) : base.quality,
      cameraSensitivity: Math.min(2.5, Math.max(0.3, Number(parsed.cameraSensitivity ?? base.cameraSensitivity))),
      volume: Math.min(1, Math.max(0, Number(parsed.volume ?? base.volume))),
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode): settings just won't persist.
  }
}
