import { QUESTS } from "../../src/game/account/quests";
import { JOBS } from "../../src/game/combat/jobs";
import { SKILLS } from "../../src/game/combat/skills";
import { WEAPONS } from "../../src/game/combat/classes";
import { maxHpAt } from "../../src/game/world/monsters";
import { portalsOf, zoneLayout } from "../../src/game/world/zones";
import { enterAs, errorOf, giveXp, join, makeCharacter, walkTo } from "./helpers";

// XP that puts a character at the start of a level (see account/level.ts).
function xpFor(level: number): number {
  let xp = 0;
  for (let l = 1, need = 60; l < level; l++, need += 30) xp += need;
  return xp;
}

async function hunter(server: any, account: string, level: number): Promise<any> {
  await makeCharacter(server, account, `성장${account.slice(-1)}`);
  await giveXp(account, xpFor(level));
  const village = await enterAs(server, account);
  const portal = portalsOf("village").find((p) => p.to === "forest1")!;
  await walkTo(server, portal.x, portal.z);
  const forest = await join(server, account, await server.travel("forest1"), village.roomId);
  const spawn = zoneLayout("forest1").playerSpawn;
  await walkTo(server, spawn.x, spawn.z, 0);
  return forest;
}

// n monsters of `type` in a ring round the forest spawn, one hit from falling.
async function ring(type: string, n: number, hp = 1): Promise<void> {
  const spawn = zoneLayout("forest1").playerSpawn;
  const monsters: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = spawn.x + Math.sin(a) * 1.5;
    const z = spawn.z - Math.cos(a) * 1.5;
    monsters[`m${i}`] = { type, x, z, yaw: 0, hp, alive: true, stunnedUntil: 0, attackReadyAt: 0, respawnAt: 0, homeX: x, homeZ: z };
  }
  await $room.updateRoomState({ monsters });
}

describe("skills", () => {
  test("the second and third skills wait for their level", async (server) => {
    await hunter(server, "test-a", 1);
    expect(await errorOf(server.useSkill(1))).toContain("unavailable");
    expect(await errorOf(server.useSkill(2))).toContain("unavailable");
    expect(await errorOf(server.useSkill(7))).toContain("unavailable");
  });

  test("at level 10 all three go off one after another", async (server) => {
    await hunter(server, "test-a", 10);
    await ring("frog", 3, 500);
    await server.useSkill(0);
    await server.useSkill(1);
    await server.useSkill(2);
    expect(await errorOf(server.useSkill(2))).toContain("too_fast");
    const hp = (await $room.getRoomState()).monsters.m0.hp;
    expect(hp).toBeLessThan(500 - SKILLS.warrior[0].damage);
  });
});

describe("advancement", () => {
  test("waits for its level, then takes one path of your own class for good", async (server) => {
    await hunter(server, "test-a", 14);
    expect(await errorOf(server.advance("berserker"))).toContain("too_low");
    await giveXp("test-a", xpFor(15));
    expect(await errorOf(server.advance("sniper"))).toContain("unavailable");
    const view = await server.advance("guardian");
    expect(view.job).toBe("guardian");
    const mine = await $room.getMyState();
    expect(mine.look.job).toBe(JOBS.guardian.name);
    expect(mine.maxHp).toBe(maxHpAt(15) + JOBS.guardian.hp);
    expect(await errorOf(server.advance("berserker"))).toContain("unavailable");
  });

  test("a damage path hits harder", async (server) => {
    await hunter(server, "test-a", 15);
    await server.advance("berserker");
    await ring("frog", 1, 500);
    await $room.updateMyState({ strikeReadyAt: 0 });
    await server.strike("m0");
    const base = WEAPONS.warrior.damage * (1 + 14 * 0.06);
    expect((await $room.getRoomState()).monsters.m0.hp).toBe(500 - Math.round(base * (1 + JOBS.berserker.power)));
  });
});

describe("quests", () => {
  test("kills of the asked kind count, and the reward comes once it is done", async (server) => {
    await hunter(server, "test-a", 1);
    const first = QUESTS[0];
    expect(await errorOf(server.claimQuest())).toContain("quest_unfinished");
    await ring("rat", 3);
    await server.useSkill(0);
    expect((await server.getBag()).quest).toEqual({ index: 0, count: 0 });

    await ring(first.targets[0], first.count);
    await $room.updateMyState({ skillReady: {} });
    await server.useSkill(0);
    const done = await server.getBag();
    expect(done.quest).toEqual({ index: 0, count: first.count });
    const xpBefore = (await server.getAccount()).xp;
    const claimed = await server.claimQuest();
    expect(claimed.quest).toEqual({ index: 1, count: 0 });
    expect(claimed.gold).toBeGreaterThanOrEqual(first.gold);
    expect(claimed.bag.potion_small).toBeGreaterThanOrEqual(3 + first.items[0].n);
    expect((await server.getAccount()).xp).toBe(xpBefore + first.xp);
    expect(await errorOf(server.claimQuest())).toContain("quest_unfinished");
  });
});
