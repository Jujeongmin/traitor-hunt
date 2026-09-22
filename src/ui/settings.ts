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
  // Which of the potion and the three skills auto-battle may use on its own (dragged down under
  // their slots to turn on).
  autoPotion: boolean;
  autoSkills: boolean[];
  // What sits in the three skill slots of the bar, per class: a skill's index, or null for an
  // empty slot. A learned skill is dragged in from the skill panel.
  hotbars: Record<string, (number | null)[]>;
}

export const HOTBAR_SLOTS = 3;

// A class's bar: its first skill in the first slot until the player arranges it.
export function hotbarFor(playerClass: string): (number | null)[] {
  const bar = current.hotbars[playerClass] ?? [0, null, null];
  return Array.from({ length: HOTBAR_SLOTS }, (_, i) => (typeof bar[i] === "number" ? bar[i] : null));
}

// Puts a skill in a slot (and takes it out of any other slot it was in), or empties the slot.
export function setHotbarSlot(playerClass: string, slot: number, skill: number | null): void {
  const bar = hotbarFor(playerClass).map((s) => (s === skill ? null : s));
  bar[slot] = skill;
  updateSettings({ hotbars: { ...current.hotbars, [playerClass]: bar } });
}

const STORAGE_KEY = "traitor-hunt:settings";
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, volume: 0.8, music: 0.5, brightness: 1, autoPotion: true, autoSkills: [true, false, false], hotbars: {},
};

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
