import { CLASSES, readClass } from "../combat/classes";
import { SKILLS } from "../combat/skills";

// How a player has set up the bar, kept on the account so it follows them to any device: which skill
// sits in each of the three slots (per class), and which of them and the potion auto-battle may use.
export interface Controls {
  hotbars: Record<string, (number | null)[]>;
  autoSkills: boolean[];
  autoPotion: boolean;
  // With the auto potion on, one is drunk when health falls to this share of the most (percent).
  potionAt: number;
}

export const HOTBAR_SLOTS = 3;
// The auto potion's threshold: from, to and by how much it steps; and where it starts.
export const POTION_AT = { min: 10, max: 90, step: 5, start: 35 } as const;

export function readPotionAt(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value / POTION_AT.step) * POTION_AT.step : POTION_AT.start;
  return Math.min(POTION_AT.max, Math.max(POTION_AT.min, n));
}

// Controls as sent or stored, or null when they are not well formed.
export function readControls(value: unknown): Controls | null {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object" || typeof v.autoPotion !== "boolean") return null;
  const auto = v.autoSkills;
  if (!Array.isArray(auto) || auto.length !== HOTBAR_SLOTS || !auto.every((a) => typeof a === "boolean")) return null;
  const bars = v.hotbars;
  if (!bars || typeof bars !== "object" || Array.isArray(bars)) return null;
  const hotbars: Record<string, (number | null)[]> = {};
  for (const [key, bar] of Object.entries(bars as Record<string, unknown>)) {
    const playerClass = readClass(key);
    if (!playerClass || !Array.isArray(bar) || bar.length !== HOTBAR_SLOTS) return null;
    const skills = SKILLS[playerClass].length;
    if (!bar.every((s) => s === null || (Number.isInteger(s) && s >= 0 && s < skills))) return null;
    hotbars[playerClass] = bar as (number | null)[];
  }
  if (Object.keys(hotbars).length > CLASSES.length) return null;
  // Saves from before the threshold was kept have none: they get the starting one.
  return { hotbars, autoSkills: [...auto], autoPotion: v.autoPotion, potionAt: readPotionAt(v.potionAt) };
}
