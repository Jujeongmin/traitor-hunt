// What a player fights with: a sword and a shield, in two builds. The striker hits harder; the
// guardian's shield soaks up more of a monster's blow.
export type PlayerClass = "striker" | "guardian";

export const CLASSES: readonly PlayerClass[] = ["striker", "guardian"];

export interface Weapon {
  name: string;
  damage: number;
  intervalMs: number;
  // How far in front a swing lands, and how wide its arc is (radians, total).
  reach: number;
  arc: number;
  // The share of a monster's blow the shield stops while you block, facing it.
  block: number;
}

export const WEAPONS: Record<PlayerClass, Weapon> = {
  striker: { name: "장검", damage: 40, intervalMs: 550, reach: 2.6, arc: (100 * Math.PI) / 180, block: 0.5 },
  guardian: { name: "검과 큰 방패", damage: 28, intervalMs: 650, reach: 2.4, arc: (120 * Math.PI) / 180, block: 0.85 },
};

export const CLASS_LABEL: Record<PlayerClass, string> = { striker: "검사", guardian: "방패병" };

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
