import { describe, expect, it } from "vitest";
import {
  FIRST_LEVEL_XP, LEVEL_STEP_XP, XP_PER_ESCAPE, XP_PER_GAME, XP_PER_MONSTER_KILL, XP_PER_WIN,
  levelOf, xpOf,
} from "../../src/game/account/level";
import { emptyProfile, type Profile } from "../../src/game/match/profile";

const profile = (over: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), ...over });

describe("xpOf", () => {
  it("counts every game, every win, every escape and every monster", () => {
    expect(xpOf(profile())).toBe(0);
    expect(xpOf(profile({ games: 3 }))).toBe(3 * XP_PER_GAME);
    expect(xpOf(profile({ games: 2, wins: 1, escapes: 1, monsterKills: 4 })))
      .toBe(2 * XP_PER_GAME + XP_PER_WIN + XP_PER_ESCAPE + 4 * XP_PER_MONSTER_KILL);
  });

  it("ignores counters that are not earned in a match", () => {
    expect(xpOf(profile({ deaths: 9, traitorDamage: 500, possessions: 3 }))).toBe(0);
  });
});

describe("levelOf", () => {
  it("starts at level 1 with nothing earned yet", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: FIRST_LEVEL_XP });
  });

  it("climbs a level once the level's XP is in, and each level asks for more", () => {
    expect(levelOf(FIRST_LEVEL_XP - 1).level).toBe(1);
    expect(levelOf(FIRST_LEVEL_XP)).toEqual({ level: 2, into: 0, need: FIRST_LEVEL_XP + LEVEL_STEP_XP });
    expect(levelOf(FIRST_LEVEL_XP + 5).into).toBe(5);
    const third = FIRST_LEVEL_XP + (FIRST_LEVEL_XP + LEVEL_STEP_XP);
    expect(levelOf(third)).toEqual({ level: 3, into: 0, need: FIRST_LEVEL_XP + 2 * LEVEL_STEP_XP });
  });

  it("keeps climbing without ever going backwards", () => {
    let last = levelOf(0).level;
    for (let xp = 0; xp < 10_000; xp += 37) {
      const now = levelOf(xp);
      expect(now.level).toBeGreaterThanOrEqual(last);
      expect(now.into).toBeLessThan(now.need);
      last = now.level;
    }
    expect(last).toBeGreaterThan(5);
  });

  it("reads a broken number as a fresh account", () => {
    expect(levelOf(Number.NaN).level).toBe(1);
    expect(levelOf(-100).level).toBe(1);
  });
});
