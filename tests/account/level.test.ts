import { describe, expect, it } from "vitest";
import { FIRST_LEVEL_XP, levelCost, levelOf, readXp } from "../../src/game/account/level";

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

  it("asks more for every level after the first, growing with its square", () => {
    expect(levelOf(FIRST_LEVEL_XP)).toEqual({ level: 2, into: 0, need: levelCost(2) });
    expect(levelOf(levelCost(1) + levelCost(2) + 5)).toEqual({ level: 3, into: 5, need: levelCost(3) });
    expect(levelCost(20)).toBeGreaterThan(levelCost(10) * 3);
  });

  it("keeps level 30 a long way off", () => {
    let xp = 0;
    for (let l = 1; l < 30; l++) xp += levelCost(l);
    expect(xp).toBeGreaterThan(400_000);
    expect(levelOf(xp).level).toBe(30);
  });
});
