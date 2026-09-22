import { MONSTERS, maxHpAt } from "../../src/game/world/monsters";
import { SKILLS } from "../../src/game/combat/skills";
import { WEAPONS } from "../../src/game/combat/classes";
import { portalsOf, zoneLayout } from "../../src/game/world/zones";
import { enterAs, errorOf, giveXp, join, makeCharacter, walkTo } from "./helpers";

// Into the first hunting field, through the village portal, as the client does it.
async function toForest(server: any, account: string, playerClass = "warrior"): Promise<any> {
  await makeCharacter(server, account, `사냥꾼${account.slice(-1)}`, playerClass);
  const village = await enterAs(server, account);
  const portal = portalsOf("village").find((p) => p.to === "forest1")!;
  await walkTo(server, portal.x, portal.z);
  return join(server, account, await server.travel("forest1"), village.roomId);
}

// Puts one monster of `type` at (x, z) and nothing else in the room.
async function only(type: string, x: number, z: number, hp = MONSTERS[type as keyof typeof MONSTERS].hp): Promise<void> {
  await $room.updateRoomState({
    monsters: {
      m0: { type, x, z, yaw: 0, hp, alive: true, stunnedUntil: 0, attackReadyAt: 0, respawnAt: 0, homeX: x, homeZ: z },
    },
  });
}

// Stands the caller at (x, z) facing -z (yaw 0), with nothing on cooldown.
async function standAt(server: any, x: number, z: number): Promise<void> {
  await walkTo(server, x, z, 0);
  await $room.updateMyState({ strikeReadyAt: 0, skillReady: {} });
}

describe("hunting", () => {
  test("a hunting field fills with monsters on its first tick", async (server) => {
    const entry = await toForest(server, "test-a");
    await server.simulateTick(entry.roomId, 200);
    const { monsters } = await $room.getRoomState();
    const count = zoneLayout("forest1").zombieSpawns.length;
    expect(Object.keys(monsters).length).toBe(count);
    expect(Object.values(monsters).every((m: any) => m.alive && m.hp > 0)).toBe(true);
  });

  test("you arrive whole, with health that grows with your level", async (server) => {
    await makeCharacter(server, "test-a", "튼튼이");
    await giveXp("test-a", 1000);
    await enterAs(server, "test-a");
    const mine = await $room.getMyState();
    expect(mine.dead).toBe(false);
    expect(mine.hp).toBeGreaterThan(maxHpAt(1));
    expect(mine.hp).toBe(mine.maxHp);
  });

  test("a monster in reach hits you, and a raised guard takes part of it", async (server) => {
    const entry = await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    await only("rat", spawn.x, spawn.z - 1);
    await server.simulateTick(entry.roomId, 200);
    const full = maxHpAt(1);
    const bare = full - (await $room.getMyState()).hp;
    expect(bare).toBe(MONSTERS.rat.damage);

    await only("rat", spawn.x, spawn.z - 1);
    await $room.updateMyState({ hp: full, pose: { ...(await $room.getMyState()).pose, block: true } });
    await server.simulateTick(entry.roomId, 200);
    expect(full - (await $room.getMyState()).hp).toBeLessThan(bare);
  });

  test("your blow lands only in reach, not faster than your weapon, and a kill pays XP", async (server) => {
    const entry = await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    await only("rat", spawn.x, spawn.z - 8);
    expect(await errorOf(server.strike("m0"))).toContain("out_of_range");
    expect(await errorOf(server.strike("nobody"))).toContain("no_monster");

    // Two blows' worth of health.
    const hp = WEAPONS.warrior.damage * 2 - 5;
    await only("rat", spawn.x, spawn.z - 1.5, hp);
    const first = await server.strike("m0");
    expect(first.hit).toEqual(["m0"]);
    expect((await $room.getRoomState()).monsters.m0.hp).toBe(hp - WEAPONS.warrior.damage);
    expect(await errorOf(server.strike("m0"))).toContain("too_fast");

    await $room.updateMyState({ strikeReadyAt: 0 });
    const kill = await server.strike("m0");
    expect(kill.killed).toEqual(["m0"]);
    expect((await $room.getRoomState()).monsters.m0.alive).toBe(false);
    expect((await $room.getMyState()).xp).toBe(MONSTERS.rat.xp);
    server.connect({ account: "test-a", roomId: entry.roomId });
    expect((await server.getAccount()).xp).toBe(MONSTERS.rat.xp);
    await $room.updateMyState({ strikeReadyAt: 0 });
    expect(await errorOf(server.strike("m0"))).toContain("monster_dead");
  });

  test("a kill pays whoever dealt the most damage, and counts for everyone who hit it", async (server) => {
    const entry = await toForest(server, "test-b");
    await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    // test-b has taken most of its health; test-a lands the last blow.
    await only("green_blob", spawn.x, spawn.z - 1.5, 10);
    const { monsters } = await $room.getRoomState();
    await $room.updateRoomState({ monsters: { m0: { ...monsters.m0, hitters: { "test-b": MONSTERS.green_blob.hp - 10 } } } });
    const kill = await server.strike("m0");
    expect(kill.killed).toEqual(["m0"]);
    expect(kill).toMatchObject({ xp: 0, gold: 0, items: [] });
    expect((await server.getAccount()).xp).toBe(0);
    expect((await server.getBag()).quest.count).toBe(1);
    expect((await $room.getMyState()).payout).toMatchObject({ xp: 0, gold: 0 });

    server.connect({ account: "test-b", roomId: entry.roomId });
    expect((await server.getAccount()).xp).toBe(MONSTERS.green_blob.xp);
    const bag = await server.getBag();
    expect(bag.quest.count).toBe(1);
    expect(bag.gold).toBeGreaterThanOrEqual(MONSTERS.green_blob.gold[0]);
    expect((await $room.getMyState()).payout).toMatchObject({ xp: MONSTERS.green_blob.xp });
    // Whole again, it forgets who hit it.
    expect((await $room.getRoomState()).monsters.m0.hitters).toBeUndefined();
  });

  test("a fallen monster comes back where it started once its time is up", async (server) => {
    const entry = await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    await only("rat", spawn.x, spawn.z - 1.5, 1);
    await server.strike("m0");
    const { monsters } = await $room.getRoomState();
    await $room.updateRoomState({ monsters: { m0: { ...monsters.m0, respawnAt: 0, x: 0, z: 0 } } });
    await server.simulateTick(entry.roomId, 200);
    const back = (await $room.getRoomState()).monsters.m0;
    expect(back).toMatchObject({ alive: true, hp: MONSTERS.rat.hp, x: back.homeX, z: back.homeZ });
  });

  test("the warrior's skill hits everything around, then waits for its cooldown", async (server) => {
    await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    const at = (dx: number, dz: number) => ({
      type: "frog", x: spawn.x + dx, z: spawn.z + dz, yaw: 0, hp: 80, alive: true, stunnedUntil: 0, attackReadyAt: 0,
      respawnAt: 0, homeX: spawn.x + dx, homeZ: spawn.z + dz,
    });
    await $room.updateRoomState({ monsters: { a: at(0, -1.5), b: at(0, 1.5), c: at(9, 0) } });
    const used = await server.useSkill();
    expect([...used.hit].sort()).toEqual(["a", "b"]);
    expect((await $room.getRoomState()).monsters.a.hp).toBe(80 - SKILLS.warrior[0].damage);
    expect(await errorOf(server.useSkill())).toContain("too_fast");
  });

  test("fallen, you can only go back to the village, where you stand up whole", async (server) => {
    const entry = await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await standAt(server, spawn.x, spawn.z);
    expect(await errorOf(server.respawn())).toContain("unavailable");
    await only("spider", spawn.x, spawn.z - 1);
    await $room.updateMyState({ hp: 1 });
    await server.simulateTick(entry.roomId, 200);
    expect((await $room.getMyState()).dead).toBe(true);
    expect(await errorOf(server.strike("m0"))).toContain("unavailable");
    const home = await server.respawn();
    expect(home.zone).toBe("village");
    await join(server, "test-a", home, entry.roomId);
    expect(await $room.getMyState()).toMatchObject({ dead: false, hp: maxHpAt(1) });
  });

  test("a reported pose is held to walking pace", async (server) => {
    await toForest(server, "test-a");
    const spawn = zoneLayout("forest1").playerSpawn;
    await walkTo(server, spawn.x, spawn.z);
    await server.reportPose({ x: spawn.x + 30, z: spawn.z, yaw: 0 });
    const pose = (await $room.getMyState()).pose;
    expect(pose.x - spawn.x).toBeLessThan(3);
    expect(pose.x).toBeGreaterThan(spawn.x);
  });
});
