import { RECIPES, enhanceCost } from "../../src/game/account/forge";
import { ITEMS } from "../../src/game/account/items";
import { enterAs, errorOf, makeCharacter, toNpc } from "./helpers";
import { readProfile, updateActive } from "../src/store";

// A character by the smith (the forge works anywhere), wearing a weapon, with gold and 강화석 to spend.
async function atTheForge(server: any, stones = 20, gold = 5000): Promise<void> {
  await makeCharacter(server, "test-a", "대장장이손님");
  await enterAs(server, "test-a");
  await updateActive("test-a", (c) => ({ ...c, bag: { ...c.bag, stone: stones, jelly: 10 }, gear: { ...c.gear, weapon: "weapon_2" } }));
  if (gold > 0) await $asset.mint("gold", gold);
  await toNpc(server, "smith");
}

// Every roll of the server comes out as `value` while `run` runs.
async function rolling<T>(value: number, run: () => Promise<T>): Promise<T> {
  const real = Math.random;
  Math.random = () => value;
  try {
    return await run();
  } finally {
    Math.random = real;
  }
}

describe("the smith", () => {
  test("enhancing spends gold and 강화석, and a success adds a + that makes the gear stronger", async (server) => {
    await atTheForge(server);
    const cost = enhanceCost("weapon_2", 0)!;
    const { outcome, bag } = await rolling(0, () => server.enhanceGear("weapon"));
    expect(outcome).toBe("success");
    expect(bag.plus.weapon_2).toBe(1);
    expect(bag.bag.stone).toBe(20 - cost.stones);
    expect(bag.gold).toBe(5000 - cost.gold);
    expect((await $room.getMyState()).gear.power).toBeGreaterThan(ITEMS.weapon_2.power);
  });

  test("a failure below +6 keeps the gear; from +6 it may break it", async (server) => {
    await atTheForge(server, 40, 50000);
    // At +1, going for +2 (+1 never fails): a roll of 0.99 fails, and below +6 nothing breaks.
    await updateActive("test-a", (c) => ({ ...c, plus: { weapon_2: 1 } }));
    const failed = await rolling(0.99, () => server.enhanceGear("weapon"));
    expect(failed.outcome).toBe("fail");
    expect(failed.bag.gear.weapon).toBe("weapon_2");
    expect(failed.bag.plus.weapon_2).toBe(1);
    // At +5, going for +6: a failed roll whose break roll comes under the chance breaks it.
    await updateActive("test-a", (c) => ({ ...c, plus: { weapon_2: 5 } }));
    const risky = enhanceCost("weapon_2", 5)!;
    expect(risky.breaks).toBeGreaterThan(0);
    const real = Math.random;
    const rolls = [0.99, 0];
    Math.random = () => rolls.shift() ?? 0.99;
    let broken: any;
    try {
      broken = await server.enhanceGear("weapon");
    } finally {
      Math.random = real;
    }
    expect(broken.outcome).toBe("broken");
    expect(broken.bag.gear.weapon).toBeNull();
    expect(broken.bag.plus.weapon_2).toBeUndefined();
  });

  test("wants what it costs, and works anywhere", async (server) => {
    await atTheForge(server, 0, 0);
    expect(await errorOf(server.enhanceGear("weapon"))).toContain("no_item");
    await updateActive("test-a", (c) => ({ ...c, bag: { ...c.bag, stone: 5 } }));
    expect(await errorOf(server.enhanceGear("weapon"))).toContain("not_enough_gold");
    expect(await errorOf(server.enhanceGear("armor"))).toContain("unavailable");
    await updateActive("test-a", (c) => ({ ...c, plus: { weapon_2: 10 } }));
    expect(await errorOf(server.enhanceGear("weapon"))).toContain("max_plus");
    // Away from the smith it works all the same.
    await toNpc(server, "merchant");
    await updateActive("test-a", (c) => ({ ...c, bag: { ...c.bag, jelly: 4 } }));
    await $asset.mint("gold", 100);
    expect((await server.craftItem("potion_big")).bag.potion_big).toBe(2);
  });

  test("makes things from materials and gold", async (server) => {
    await atTheForge(server);
    const recipe = RECIPES.find((r) => r.id === "weapon_1")!;
    const bag = await server.craftItem("weapon_1");
    expect(bag.bag.weapon_1).toBe(1);
    expect(bag.bag.jelly).toBe(10 - recipe.needs[0].n);
    expect(bag.gold).toBe(5000 - recipe.gold);
    expect(await errorOf(server.craftItem("weapon_4"))).toContain("no_item");
    expect(await errorOf(server.craftItem("nothing"))).toContain("unavailable");
    expect((await readProfile("test-a")).active!.bag.weapon_1).toBe(1);
  });
});
