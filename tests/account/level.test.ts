import { describe, expect, it } from "vitest";
import { FIRST_LEVEL_XP, LEVEL_STEP_XP, levelOf, readXp } from "../../src/game/account/level";

describe("readXp", () => {
  it("keeps whole, positive numbers and drops the rest", () => {
    expect(readXp(125.7)).toBe(125);
    expect(readXp(-3)).toBe(0);
    expect(readXp("99")).toBe(0);
    expect(readXp(undefined)).toBe(0);
  });
});

describe("levelOf", () => {
  it("starts at level 1", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: FIRST_LEVEL_XP });
  });

  it("asks one step more for every level after the first", () => {
    expect(levelOf(FIRST_LEVEL_XP)).toEqual({ level: 2, into: 0, need: FIRST_LEVEL_XP + LEVEL_STEP_XP });
    expect(levelOf(FIRST_LEVEL_XP + FIRST_LEVEL_XP + LEVEL_STEP_XP + 5).level).toBe(3);
  });
});
