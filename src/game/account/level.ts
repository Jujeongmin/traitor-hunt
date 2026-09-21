// A character's experience and the level it adds up to. XP is saved on the account as one number;
// hunting (phase 2) and quests add to it.

// Level 1 ends at this much XP, and every level after asks for one step more than the last.
export const FIRST_LEVEL_XP = 60;
export const LEVEL_STEP_XP = 30;

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
  let need = FIRST_LEVEL_XP;
  while (left >= need) {
    left -= need;
    level += 1;
    need += LEVEL_STEP_XP;
  }
  return { level, into: left, need };
}
