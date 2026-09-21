// Player settings, kept in this browser. Read live by the game view and the sound effects.
export interface Settings {
  // Multiplies mouse look speed.
  sensitivity: number;
  // 0 to 1.
  volume: number;
  // Background music, 0 to 1.
  music: number;
  // Renderer exposure.
  brightness: number;
}

const STORAGE_KEY = "traitor-hunt:settings";
export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, volume: 0.8, music: 0.5, brightness: 1 };

function load(): Settings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...(JSON.parse(saved) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Without storage the settings still apply until the page closes.
  }
  for (const listener of listeners) listener(current);
}

export function onSettings(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
