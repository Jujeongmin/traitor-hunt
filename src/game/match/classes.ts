// What a player fights with. Each class is one of the RPG Character Pack heroes (Quaternius) with
// its own weapon: three fight up close, the ranger and the wizard from afar, and the cleric heals.
export type PlayerClass = "warrior" | "ranger" | "wizard" | "cleric" | "rogue" | "monk";

export const CLASSES: readonly PlayerClass[] = ["warrior", "ranger", "wizard", "cleric", "rogue", "monk"];

export interface Weapon {
  name: string;
  damage: number;
  intervalMs: number;
  // How far in front a blow or shot lands, and how wide its arc is (radians, total).
  reach: number;
  arc: number;
  // The share of a monster's blow a raised guard stops, facing it.
  block: number;
  // Shots fly to their target instead of landing where the arm swings.
  ranged: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const WEAPONS: Record<PlayerClass, Weapon> = {
  warrior: { name: "장검", damage: 40, intervalMs: 600, reach: 2.6, arc: deg(110), block: 0.7, ranged: false },
  ranger: { name: "활", damage: 26, intervalMs: 750, reach: 12, arc: deg(18), block: 0.3, ranged: true },
  wizard: { name: "마법 지팡이", damage: 32, intervalMs: 950, reach: 9, arc: deg(24), block: 0.3, ranged: true },
  cleric: { name: "성직자 지팡이", damage: 24, intervalMs: 700, reach: 2.8, arc: deg(110), block: 0.5, ranged: false },
  rogue: { name: "단검", damage: 30, intervalMs: 400, reach: 2.2, arc: deg(90), block: 0.4, ranged: false },
  monk: { name: "주먹", damage: 28, intervalMs: 480, reach: 2.3, arc: deg(110), block: 0.6, ranged: false },
};

export const CLASS_LABEL: Record<PlayerClass, string> = {
  warrior: "전사", ranger: "궁수", wizard: "마법사", cleric: "성직자", rogue: "도적", monk: "무도가",
};

export const CLASS_BLURB: Record<PlayerClass, string> = {
  warrior: "장검과 갑옷. 튼튼하게 버티며 벤다",
  ranger: "멀리서 활로 쏜다. 가까이 붙으면 약하다",
  wizard: "지팡이로 마법 탄을 날린다. 느리지만 멀리 닿는다",
  cleric: "동료와 자신을 치유한다",
  rogue: "단검으로 아주 빠르게 찌른다",
  monk: "맨손 연타와 기절 기술",
};

// The pre-RPG classes, kept so an old save still reads as something close.
const OLD: Record<string, PlayerClass> = { striker: "warrior", guardian: "monk" };

export function readClass(value: unknown): PlayerClass | null {
  if (typeof value === "string" && OLD[value]) return OLD[value];
  return CLASSES.find((c) => c === value) ?? null;
}

// Seats nobody chose for (bots, or a player who never picked) take turns, so a room gets a mix.
export function classForSeat(seat: number): PlayerClass {
  const n = CLASSES.length;
  return CLASSES[((seat % n) + n) % n];
}

export function classFor(classes: Record<string, string> | undefined, account: string, seat: number): PlayerClass {
  return readClass(classes?.[account]) ?? classForSeat(seat);
}
