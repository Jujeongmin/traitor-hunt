import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import { portalsOf } from "../../src/game/world/zones";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { WorldClient } from "../../src/net/worldClient";

// Each account gets a character named after it, ready to enter.
async function clients(...accounts: string[]): Promise<{ world: LocalWorld; list: WorldClient[] }> {
  const world = new LocalWorld(new Server());
  const list: WorldClient[] = [];
  for (const a of accounts) {
    const transport = new LocalTransport(world, a);
    await transport.call("createCharacter", [a.replace(/[^a-z0-9]/g, ""), "warrior", "0000"]);
    list.push(new WorldClient(transport));
  }
  return { world, list };
}

describe("WorldClient", () => {
  it("enters the village and sees the others who are there, with their names", async () => {
    const { world, list: [a, b] } = await clients("test-a", "test-b");
    await a.enter();
    await b.enter();
    await world.idle();
    expect(a.state.phase).toBe("in");
    expect(a.state.entry?.zone).toBe("village");
    expect(a.state.others.map((o) => o.account)).toEqual(["test-b"]);
    expect(a.state.others[0].look.name).toBe("testb");
  });

  it("follows the others as they move", async () => {
    const { world, list: [a, b] } = await clients("test-a", "test-b");
    await a.enter();
    await b.enter();
    b.reportPose({ x: 9, z: 10, yaw: 1, swing: 2 });
    await world.idle();
    expect(a.state.others[0].pose).toMatchObject({ x: 9, z: 10, yaw: 1, swing: 2 });
  });

  it("drops someone who leaves, and walks through a portal", async () => {
    const { world, list: [a, b] } = await clients("test-a", "test-b");
    await a.enter();
    await b.enter();
    await b.leave();
    await world.idle();
    expect(a.state.others).toEqual([]);

    const portal = portalsOf("village")[0];
    a.reportPose({ x: portal.x, z: portal.z, yaw: 0 });
    await world.idle();
    expect(await a.travel("forest1")).toBeNull();
    expect(a.state.entry?.zone).toBe("forest1");
  });

  it("stays put when a portal refuses", async () => {
    const { list: [a] } = await clients("test-a");
    await a.enter();
    expect(await a.travel("forest1")).toBe("not_near");
    expect(a.state.phase).toBe("in");
    expect(a.state.entry?.zone).toBe("village");
  });
});
