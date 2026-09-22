// A character's experience and the level it adds up to. XP is saved on the account as one number;
// hunting (phase 2) and quests add to it.

// What a whole level costs: it grows with the square of the level, so each one asks noticeably more
// than the last. Hunting at a steady pace, level 10 takes about two hours, 20 about nine and 30
// (advancement) about thirty.
const LEVEL_XP_SCALE = 50;

export function levelCost(level: number): number {
  return LEVEL_XP_SCALE * level * level + LEVEL_XP_SCALE;
}

export const FIRST_LEVEL_XP = levelCost(1);

// Saved XP, trusted only as a whole, non-negative number.
export function readXp(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export interface LevelView {
  level: number;
  // XP earned inside the current level, and what the whole level costs.
  into: number;
  need: number;
}

export function levelOf(xp: number): LevelView {
  let left = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  let need = levelCost(1);
  while (left >= need) {
    left -= need;
    level += 1;
    need = levelCost(level);
  }
  return { level, into: left, need };
}
