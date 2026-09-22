import { describe, expect, it } from "vitest";
import { NO_GEAR } from "../../src/game/account/items";
import { levelCost } from "../../src/game/account/level";
import { combatPower } from "../../src/game/combat/power";

describe("combatPower", () => {
  const base = { xp: 0, playerClass: "warrior" as const, gear: NO_GEAR, job: null };

  it("grows with level, gear and an advanced class", () => {
    const start = combatPower(base);
    expect(start).toBeGreaterThan(0);
    expect(combatPower({ ...base, xp: levelCost(1) + levelCost(2) })).toBeGreaterThan(start);
    expect(combatPower({ ...base, gear: { weapon: "weapon_2", armor: null } })).toBeGreaterThan(start);
    expect(combatPower({ ...base, gear: { weapon: null, armor: "armor_2" } })).toBeGreaterThan(start);
    expect(combatPower({ ...base, job: "berserker" })).toBeGreaterThan(start);
  });
});
