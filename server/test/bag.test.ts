import { ITEMS, sellPrice } from "../../src/game/account/items";
import { WEAPONS } from "../../src/game/combat/classes";
import { MONSTERS, maxHpAt } from "../../src/game/world/monsters";
import { portalsOf, zoneLayout } from "../../src/game/world/zones";
import { enterAs, errorOf, join, makeCharacter, toNpc, walkTo } from "./helpers";

// A character standing in the village, by the merchant.
async function inVillage(server: any, account = "test-a"): Promise<any> {
  await makeCharacter(server, account, `상인${account.slice(-1)}`);
  const entry = await enterAs(server, account);
  await toNpc(server, "merchant");
  return entry;
}

async function toForest(server: any, account: string, from: any): Promise<any> {
  const portal = portalsOf("village").find((p) => p.to === "forest1")!;
  await walkTo(server, portal.x, portal.z);
  return join(server, account, await server.travel("forest1"), from.roomId);
}

describe("bag and gold", () => {
  test("a new character starts with a few potions and no gold", async (server) => {
    await inVillage(server);
    expect(await server.getBag()).toEqual({
      gold: 0, bag: { potion_small: 3 }, gear: { weapon: null, armor: null }, plus: {}, job: null, quest: { index: 0, count: 0 },
    });
  });

  test("a kill pays gold onto the account alongside the XP", async (server) => {
    const village = await inVillage(server);
    await toForest(server, "test-a", village);
    const spawn = zoneLayout("forest1").playerSpawn;
    await walkTo(server, spawn.x, spawn.z, 0);
    await $room.updateRoomState({
      monsters: {
        m0: {
          type: "rat", x: spawn.x, z: spawn.z - 1.5, yaw: 0, hp: 1, alive: true, stunnedUntil: 0, attackReadyAt: 0,
          respawnAt: 0, homeX: spawn.x, homeZ: spawn.z - 1.5,
        },
      },
    });
    const result = await server.strike("m0");
    const [low, high] = MONSTERS.rat.gold;
    expect(result.gold).toBeGreaterThanOrEqual(low);
    expect(result.gold).toBeLessThanOrEqual(high);
    expect((await server.getBag()).gold).toBe(result.gold);
  });

  test("the shop is the merchant's, in the village, and wants the gold up front", async (server) => {
    const village = await inVillage(server);
    await walkTo(server, zoneLayout("village").playerSpawn.x, zoneLayout("village").playerSpawn.z);
    expect(await errorOf(server.buyItem("potion_small"))).toContain("not_near");
    await toNpc(server, "merchant");
    expect(await errorOf(server.buyItem("potion_small"))).toContain("not_enough_gold");
    expect(await errorOf(server.buyItem("weapon_3"))).toContain("unavailable");
    await $asset.mint("gold", 100);
    const bought = await server.buyItem("potion_small", 2);
    expect(bought.gold).toBe(100 - ITEMS.potion_small.price! * 2);
    expect(bought.bag.potion_small).toBe(5);
    const sold = await server.sellItem("potion_small", 5);
    expect(sold.bag.potion_small).toBeUndefined();
    expect(sold.gold).toBe(bought.gold + sellPrice("potion_small") * 5);
    expect(await errorOf(server.sellItem("potion_small"))).toContain("no_item");

    await toForest(server, "test-a", village);
    expect(await errorOf(server.buyItem("potion_small"))).toContain("not_in_village");
  });

  test("worn gear hits harder and holds more health; taking it off puts it back in the bag", async (server) => {
    await inVillage(server);
    await $asset.mint("gold", 1000);
    await server.buyItem("weapon_1");
    await server.buyItem("armor_1");
    await server.equipItem("weapon_1");
    const worn = await server.equipItem("armor_1");
    expect(worn.gear).toEqual({ weapon: "weapon_1", armor: "armor_1" });
    expect(worn.bag.weapon_1).toBeUndefined();
    const mine = await $room.getMyState();
    expect(mine.maxHp).toBe(maxHpAt(1) + ITEMS.armor_1.hp);
    expect(mine.gear.power).toBe(ITEMS.weapon_1.power);
    expect(await errorOf(server.equipItem("potion_small"))).toContain("unavailable");

    const off = await server.unequipItem("weapon");
    expect(off.gear.weapon).toBeNull();
    expect(off.bag.weapon_1).toBe(1);
    expect((await $room.getMyState()).gear.power).toBe(0);
  });

  test("a sharper weapon lands a bigger blow", async (server) => {
    const village = await inVillage(server);
    await $asset.mint("gold", 1000);
    await server.buyItem("weapon_2");
    await server.equipItem("weapon_2");
    await toForest(server, "test-a", village);
    const spawn = zoneLayout("forest1").playerSpawn;
    await walkTo(server, spawn.x, spawn.z, 0);
    await $room.updateRoomState({
      monsters: {
        m0: {
          type: "frog", x: spawn.x, z: spawn.z - 1.5, yaw: 0, hp: 500, alive: true, stunnedUntil: 0, attackReadyAt: 0,
          respawnAt: 0, homeX: spawn.x, homeZ: spawn.z - 1.5,
        },
      },
    });
    await server.strike("m0");
    const expected = Math.round(WEAPONS.warrior.damage * (1 + ITEMS.weapon_2.power));
    expect((await $room.getRoomState()).monsters.m0.hp).toBe(500 - expected);
  });

  test("a potion heals up to full and is used up", async (server) => {
    await inVillage(server);
    await $room.updateMyState({ hp: 10 });
    const after = await server.drinkPotion("potion_small");
    expect(after.bag.potion_small).toBe(2);
    expect((await $room.getMyState()).hp).toBe(10 + ITEMS.potion_small.heal);
    await server.drinkPotion("potion_small");
    await server.drinkPotion("potion_small");
    expect((await $room.getMyState()).hp).toBe(maxHpAt(1));
    expect(await errorOf(server.drinkPotion("potion_small"))).toContain("no_item");
  });
});
