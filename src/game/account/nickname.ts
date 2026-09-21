import type { LevelView } from "./level";

import { RuleViolation } from "../match/types";

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
  // Null until the player picks one; the menu asks for it before online play.
  nickname: string | null;
  // Earned in matches (see level.ts), so the menu can show how far along you are.
  xp: number;
  level: LevelView;
}
