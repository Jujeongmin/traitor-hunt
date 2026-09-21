import { CHANNEL_CAPACITY, arrivalFrom, portalsOf, zoneLayout } from "../../src/game/world/zones";
import { errorOf, inRoom } from "./helpers";

// A real wallet account: it does not play for free like the test- accounts.
const BUYER = "0x1111111111111111111111111111111111111111";

describe("entering the world", () => {
  test("a new character starts in the village, channel 1 of its server, showing its look", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w2");
    await server.setNickname("새싹");
    await server.setClass("ranger");
    const entry = await server.enterWorld();
    const spawn = zoneLayout("village").playerSpawn;
    expect(entry).toEqual({ roomId: "rpg-w2-village-1", zone: "village", channel: 1, x: spawn.x, z: spawn.z });
    const mine = await $global.getRoomUserState(entry.roomId, "test-a");
    expect(mine.look).toMatchObject({ name: "새싹", playerClass: "ranger", level: 1 });
    expect(mine.pose).toMatchObject({ x: spawn.x, z: spawn.z });
  });

  test("players on different servers never share a room", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w1");
    const a = await server.enterWorld();
    server.connect({ account: "test-b" });
    await server.setWorld("w4");
    const b = await server.enterWorld();
    expect(a.roomId === b.roomId).toBe(false);
  });

  test("a full channel sends the next player to the next one", async (server) => {
    for (let i = 0; i < CHANNEL_CAPACITY; i++) {
      server.connect({ account: `test-p${i}` });
      expect((await server.enterWorld()).channel).toBe(1);
    }
    server.connect({ account: "test-late" });
    expect((await server.enterWorld()).channel).toBe(2);
  });

  test("comes back where it left", async (server) => {
    server.connect({ account: "test-a" });
    const entry = await server.enterWorld();
    inRoom(server, "test-a", entry.roomId);
    await server.reportPose({ x: 10, z: 13, yaw: 1 });
    await server.leaveWorld();
    server.connect({ account: "test-a" });
    expect(await server.enterWorld()).toMatchObject({ zone: "village", x: 10, z: 13 });
  });
});

describe("portals", () => {
  test("take you to the next zone only while you stand at the portal", async (server) => {
    server.connect({ account: "test-a" });
    const entry = await server.enterWorld();
    inRoom(server, "test-a", entry.roomId);
    expect(await errorOf(server.travel("forest1"))).toContain("not_near");
    const portal = portalsOf("village").find((p) => p.to === "forest1")!;
    await server.reportPose({ x: portal.x, z: portal.z, yaw: 0 });
    const field = await server.travel("forest1");
    const at = arrivalFrom("forest1", "village");
    expect(field).toMatchObject({ zone: "forest1", roomId: "rpg-w1-forest1-1", x: at.x, z: at.z });
  });

  test("lead nowhere but the zones next door", async (server) => {
    server.connect({ account: "test-a" });
    const entry = await server.enterWorld();
    inRoom(server, "test-a", entry.roomId);
    expect(await errorOf(server.travel("boss"))).toContain("no_zone");
    expect(await errorOf(server.travel("moon"))).toContain("no_zone");
  });

  test("the second field needs the full game", async (server) => {
    const into = async (account: string) => {
      server.connect({ account });
      let entry = await server.enterWorld();
      // Walks on from wherever it came back in.
      const path = ["village", "forest1", "forest2"];
      for (const to of path.slice(path.indexOf(entry.zone) + 1)) {
        inRoom(server, account, entry.roomId);
        const portal = portalsOf(entry.zone).find((p) => p.to === to)!;
        await server.reportPose({ x: portal.x, z: portal.z, yaw: 0 });
        entry = await server.travel(to);
      }
      return entry;
    };
    expect(await errorOf(into(BUYER))).toContain("not_owned");
    await server.$onItemPurchased({ account: BUYER, purchaseId: 7, productId: "full-game", quantity: 1 });
    expect((await into(BUYER)).zone).toBe("forest2");
  });
});
