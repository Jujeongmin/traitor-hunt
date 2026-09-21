import type { Profile } from "../match/profile";

// What a match pays. Playing to the end is worth something on its own; winning, getting out alive
// and clearing monsters are worth more.
export const XP_PER_GAME = 10;
export const XP_PER_WIN = 20;
export const XP_PER_ESCAPE = 10;
export const XP_PER_MONSTER_KILL = 2;

// Level 1 ends at this much XP, and every level after asks for one step more than the last.
export const FIRST_LEVEL_XP = 60;
export const LEVEL_STEP_XP = 30;

// Levels are read from the counters a match already saves, so no account needs converting.
export function xpOf(profile: Profile): number {
  return profile.games * XP_PER_GAME
    + profile.wins * XP_PER_WIN
    + profile.escapes * XP_PER_ESCAPE
    + profile.monsterKills * XP_PER_MONSTER_KILL;
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
