import type { CharacterView } from "./characters";
import type { LevelView } from "./level";

import { RuleViolation } from "../world/types";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
// Composed Hangul syllables only, so lone jamo like "ㅋㅋ" do not count.
const ALLOWED = /^[0-9A-Za-z_가-힣]+$/;

export interface Nickname {
  name: string;
  // Case-insensitive form; no two accounts may share one.
  key: string;
}

export function parseNickname(raw: unknown): Nickname {
  if (typeof raw !== "string") throw new RuleViolation("nickname_invalid");
  const name = raw.normalize("NFC").trim();
  const length = [...name].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX || !ALLOWED.test(name)) {
    throw new RuleViolation("nickname_invalid");
  }
  return { name, key: name.toLowerCase() };
}

export interface AccountView {
  account: string;
  // Bought the full game (the paid zones and levels).
  owned: boolean;
  // The server picked when you last started (see worlds.ts); null if you never picked one.
  world: string | null;
  // Your characters on that server, and the one you play (null until you pick or make one).
  characters: CharacterView[];
  active: CharacterView | null;
  // The active character, spelled out for the menus; null and level 1 without one.
  nickname: string | null;
  xp: number;
  level: LevelView;
  playerClass: string | null;
  costume: string | null;
}
