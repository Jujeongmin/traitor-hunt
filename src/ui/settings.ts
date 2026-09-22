import { HOTBAR_SLOTS, POTION_AT, type Controls } from "../game/account/controls";

// Player settings, kept in this browser (the bar's set-up is also kept on the account; see
// syncControls). Read live by the game view and the sound effects.
export interface Settings extends Controls {
  // Multiplies mouse look speed.
  sensitivity: number;
  // 0 to 1.
  volume: number;
  // Background music, 0 to 1.
  music: number;
  // Renderer exposure.
  brightness: number;
  // Moving the mouse up looks down.
  invertY: boolean;
  // How much the world draws (see QUALITY).
  quality: Quality;
  // Other players' names over them, damage numbers over monsters and you, chat lines over speakers.
  showNames: boolean;
  damageNumbers: boolean;
  chatBubbles: boolean;
  // From Controls: which of the potion and the three skills auto-battle may use on its own
  // (dragged down under their slots to turn on), and what sits in the three skill slots of the bar,
  // per class (a skill's index, or null for an empty slot; a learned skill is dragged in from the
  // skill panel).
}

// The part of the settings kept on the account.
export function controlsOf(s: Settings): Controls {
  return { hotbars: s.hotbars, autoSkills: s.autoSkills, autoPotion: s.autoPotion, potionAt: s.potionAt };
}

export { HOTBAR_SLOTS };

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
// Graphics quality: how many pixels a point (at most) and how near trees and ground cover are drawn in
// full (metres; beyond, pictures or nothing).
export type Quality = "low" | "mid" | "high";
export const QUALITY: Record<Quality, { label: string; pixelRatio: number; near: number }> = {
  low: { label: "낮음", pixelRatio: 1, near: 26 },
  mid: { label: "보통", pixelRatio: 1.5, near: 38 },
  high: { label: "높음", pixelRatio: 2, near: 55 },
};
// Phones and tablets start at the middle; computers at the top.
const COARSE = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

export const DEFAULT_SETTINGS: Settings = {
  invertY: false, quality: COARSE ? "mid" : "high", showNames: true, damageNumbers: true, chatBubbles: true,
  sensitivity: 1, volume: 0.8, music: 0.5, brightness: 1, autoPotion: true, potionAt: POTION_AT.start, autoSkills: [true, false, false], hotbars: {},
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
