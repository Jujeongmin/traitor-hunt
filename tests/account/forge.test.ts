import { describe, expect, it } from "vitest";
import { BREAK_FROM, RECIPES, enhanceCost, rollEnhance } from "../../src/game/account/forge";
import { ITEMS, MAX_PLUS, gearName, gearStats, sellPrice } from "../../src/game/account/items";
import { MONSTERS } from "../../src/game/world/monsters";

describe("enhancing", () => {
  it("gets dearer and riskier the higher it goes, and stops at +10", () => {
    let last = enhanceCost("weapon_2", 0)!;
    expect(last).toMatchObject({ to: 1, success: 1, breaks: 0 });
    for (let plus = 1; plus < MAX_PLUS; plus++) {
      const next = enhanceCost("weapon_2", plus)!;
      expect(next.gold).toBeGreaterThan(last.gold);
      expect(next.success).toBeLessThanOrEqual(last.success);
      expect(next.breaks > 0).toBe(next.to >= BREAK_FROM);
      last = next;
    }
    expect(enhanceCost("weapon_2", MAX_PLUS)).toBeNull();
    // Better gear costs more to enhance.
    expect(enhanceCost("weapon_5", 3)!.gold).toBeGreaterThan(enhanceCost("weapon_1", 3)!.gold);
  });

  it("succeeds, fails or breaks by its rolls", () => {
    const risky = enhanceCost("armor_2", 7)!;
    expect(rollEnhance(risky, 0, 0.99)).toBe("success");
    expect(rollEnhance(risky, 0.99, 0.99)).toBe("fail");
    expect(rollEnhance(risky, 0.99, 0)).toBe("broken");
    expect(rollEnhance(enhanceCost("armor_2", 2)!, 0.99, 0)).toBe("fail");
  });

  it("adds to the gear's stats and shows in its name", () => {
    const plain = gearStats({ weapon: "weapon_2", armor: "armor_2" });
    const plus = gearStats({ weapon: "weapon_2", armor: "armor_2" }, { weapon_2: 5, armor_2: 3 });
    expect(plus.power).toBeGreaterThan(plain.power);
    expect(plus.hp).toBeGreaterThan(plain.hp);
    expect(plus.guard).toBeGreaterThan(plain.guard);
    expect(gearName("weapon_2", { weapon_2: 5 })).toBe(`+5 ${ITEMS.weapon_2.name}`);
  });
});

describe("crafting", () => {
  it("makes gear and potions from materials the monsters drop", () => {
    const dropped = new Set(Object.values(MONSTERS).flatMap((m) => m.drops.map((d) => d.item)));
    for (const recipe of RECIPES) {
      expect(recipe.n).toBeGreaterThan(0);
      for (const need of recipe.needs) {
        expect(ITEMS[need.item].kind).toBe("material");
        expect(dropped).toContain(need.item);
      }
    }
    for (const id of ["stone", "jelly", "silk", "core", "spore"] as const) expect(sellPrice(id)).toBeGreaterThan(0);
  });
});
