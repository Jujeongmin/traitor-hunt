import { CHANNEL_CAPACITY, arrivalFrom, portalsOf, zoneLayout } from "../../src/game/world/zones";
import { enterAs, errorOf, join, makeCharacter, walkTo } from "./helpers";

// A real wallet account: it does not play for free like the test- accounts.
const BUYER = "0x1111111111111111111111111111111111111111";

// Stands at the portal to `to` and goes through, as the client does.
async function through(server: any, account: string, entry: any, to: string): Promise<any> {
  const portal = portalsOf(entry.zone).find((p) => p.to === to)!;
  await walkTo(server, portal.x, portal.z);
  const next = await server.travel(to);
  return join(server, account, next, entry.roomId);
}

describe("entering the world", () => {
  test("a new character starts in the village, channel 1 of its server, showing its look", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w2");
    await server.createCharacter("새싹", "ranger", "0000");
    const entry = await server.enterWorld();
    const spawn = zoneLayout("village").playerSpawn;
    expect(entry).toEqual({ roomId: "rpg-w2-village-1", zone: "village", channel: 1, x: spawn.x, z: spawn.z });
    await join(server, "test-a", entry);
    const mine = await $room.getMyState();
    expect(mine.look).toMatchObject({ name: "새싹", playerClass: "ranger", level: 1 });
    expect(mine.pose).toMatchObject({ x: spawn.x, z: spawn.z });
  });

  test("players on different servers never share a room", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w1");
    await server.createCharacter("에이", "warrior", "0000");
    const a = await server.enterWorld();
    server.connect({ account: "test-b" });
    await server.setWorld("w4");
    await server.createCharacter("비이", "warrior", "0000");
    const b = await server.enterWorld();
    expect(a.roomId === b.roomId).toBe(false);
  });

  test("a full channel sends the next player to the next one", async (server) => {
    for (let i = 0; i < CHANNEL_CAPACITY; i++) {
      await makeCharacter(server, `test-p${i}`, `손님${i}`);
      expect((await enterAs(server, `test-p${i}`)).channel).toBe(1);
    }
    await makeCharacter(server, "test-late", "늦은손님");
    server.connect({ account: "test-late" });
    expect((await server.enterWorld()).channel).toBe(2);
  });

  test("comes back where it left, by leaving or by just going away", async (server) => {
    await makeCharacter(server, "test-a", "에이");
    await enterAs(server, "test-a");
    await walkTo(server, 10, 13, 1);
    await server.leaveWorld();
    server.connect({ account: "test-a" });
    const back = await server.enterWorld();
    expect(back).toMatchObject({ zone: "village", x: 10, z: 13 });

    // A closed tab: no leaveWorld, only the platform's leave hook.
    await join(server, "test-a", back);
    await walkTo(server, 14, 13, 1);
    await server.simulateLeave(back.roomId, "test-a");
    server.connect({ account: "test-a" });
    expect(await server.enterWorld()).toMatchObject({ zone: "village", x: 14, z: 13 });
  });
});

describe("portals", () => {
  test("take you to the next zone only while you stand at the portal", async (server) => {
    await makeCharacter(server, "test-a", "에이");
    const entry = await enterAs(server, "test-a");
    expect(await errorOf(server.travel("forest1"))).toContain("not_near");
    const field = await through(server, "test-a", entry, "forest1");
    const at = arrivalFrom("forest1", "village");
    expect(field).toMatchObject({ zone: "forest1", roomId: "rpg-w1-forest1-1", x: at.x, z: at.z });
    expect((await $room.getMyState()).pose).toMatchObject({ x: at.x, z: at.z });
  });

  test("lead nowhere but the zones next door", async (server) => {
    await makeCharacter(server, "test-a", "에이");
    await enterAs(server, "test-a");
    expect(await errorOf(server.travel("boss"))).toContain("no_zone");
    expect(await errorOf(server.travel("moon"))).toContain("no_zone");
  });

  test("the second field needs the full game", async (server) => {
    await makeCharacter(server, BUYER, "구매자");
    const field = await through(server, BUYER, await enterAs(server, BUYER), "forest1");
    expect(await errorOf(through(server, BUYER, field, "forest2"))).toContain("not_owned");
    await server.$onItemPurchased({ account: BUYER, purchaseId: 7, productId: "full-game", quantity: 1 });
    server.connect({ account: BUYER, roomId: field.roomId });
    expect((await through(server, BUYER, field, "forest2")).zone).toBe("forest2");
  });
});
