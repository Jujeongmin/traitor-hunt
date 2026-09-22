import { describe, expect, it } from "vitest";
import { MAX_STACK, NO_GEAR, addItem, equip, gearStats, readBag, readGear, unequip } from "../../src/game/account/items";
import { MONSTERS, rollLoot } from "../../src/game/world/monsters";

describe("items", () => {
  it("stacks up to a limit, and refuses to take away what is not there", () => {
    expect(addItem({}, "potion_small", 2)).toEqual({ potion_small: 2 });
    expect(addItem({ potion_small: 2 }, "potion_small", -2)).toEqual({});
    expect(addItem({ potion_small: 98 }, "potion_small", 5)).toEqual({ potion_small: MAX_STACK });
    expect(() => addItem({}, "potion_small", -1)).toThrow("no_item");
  });

  it("wearing swaps with what was in the slot, and adds up in a fight", () => {
    const first = equip({ weapon_1: 1, weapon_2: 1 }, NO_GEAR, "weapon_1");
    expect(first).toEqual({ bag: { weapon_2: 1 }, gear: { weapon: "weapon_1", armor: null } });
    const second = equip(first.bag, first.gear, "weapon_2");
    expect(second).toEqual({ bag: { weapon_1: 1 }, gear: { weapon: "weapon_2", armor: null } });
    expect(gearStats({ weapon: "weapon_2", armor: "armor_2" })).toEqual({ power: 0.25, hp: 60, guard: 0.1 });
    expect(unequip(second.bag, second.gear, "weapon")).toEqual({ bag: { weapon_1: 1, weapon_2: 1 }, gear: NO_GEAR });
    expect(() => equip({ potion_small: 1 }, NO_GEAR, "potion_small")).toThrow("unavailable");
  });

  it("reads back only what makes sense from a save", () => {
    expect(readBag({ potion_small: 2, nothing: 3, potion_big: -1, weapon_1: 1.5 })).toEqual({ potion_small: 2 });
    expect(readGear({ weapon: "armor_1", armor: "armor_1" })).toEqual({ weapon: null, armor: "armor_1" });
    expect(readGear(undefined)).toEqual(NO_GEAR);
  });

  it("loot pays gold in the monster's range and drops on each item's chance", () => {
    const [low, high] = MONSTERS.rat.gold;
    expect(rollLoot("rat", () => 0)).toEqual({ gold: low, items: ["potion_small", "weapon_1", "armor_1", "jelly", "stone"] });
    expect(rollLoot("rat", () => 0.999)).toEqual({ gold: high, items: [] });
  });
});
