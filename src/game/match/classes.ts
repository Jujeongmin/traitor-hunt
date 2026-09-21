// What a player fights with. The mage's wand fires often and lightly; the archer's bow fires slowly
// and hits hard. Both reach about the same distance, so neither is stuck at the back.
export type PlayerClass = "mage" | "archer";

export const CLASSES: readonly PlayerClass[] = ["mage", "archer"];

export interface Weapon {
  name: string;
  damage: number;
  intervalMs: number;
  range: number;
}

export const WEAPONS: Record<PlayerClass, Weapon> = {
  mage: { name: "마법 지팡이", damage: 25, intervalMs: 200, range: 50 },
  archer: { name: "활", damage: 55, intervalMs: 600, range: 60 },
};

export const CLASS_LABEL: Record<PlayerClass, string> = { mage: "마법사", archer: "궁수" };

export function readClass(value: unknown): PlayerClass | null {
  return CLASSES.find((c) => c === value) ?? null;
}

// Seats nobody chose for (bots, or a player who never picked) take turns, so a room gets both.
export function classForSeat(seat: number): PlayerClass {
  const n = CLASSES.length;
  return CLASSES[((seat % n) + n) % n];
}

export function classFor(classes: Record<string, string> | undefined, account: string, seat: number): PlayerClass {
  return readClass(classes?.[account]) ?? classForSeat(seat);
}
