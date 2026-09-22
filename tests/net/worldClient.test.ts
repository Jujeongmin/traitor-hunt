import { afterEach, describe, expect, it, vi } from "vitest";
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


// The server holds reported poses to walking pace; a minute on, any spot is in reach.
function aMinuteLater(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
}

describe("WorldClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    aMinuteLater();
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
    aMinuteLater();
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

describe("WorldClient chat", () => {
  it("hears what is said in the channel, its own lines marked", async () => {
    const { world, list: [a, b] } = await clients("test-a", "test-b");
    await a.enter();
    await b.enter();
    expect(await a.say("  안녕!  ")).toBeNull();
    await world.idle();
    expect(b.state.chat).toEqual([expect.objectContaining({ account: "test-a", name: "testa", text: "안녕!", mine: false })]);
    expect(a.state.chat[0]).toMatchObject({ text: "안녕!", mine: true });
    expect(await a.say("또")).toBe("too_fast");
    expect(await a.say("   ")).toBe("unavailable");
  });
});

describe("WorldClient payouts", () => {
  // A server that can also write a payout into the caller's room user state, as a kill does.
  class PayingServer extends Server {
    async pay(id: string, xp: number): Promise<void> {
      await $room.updateMyState({ payout: { id, xp, gold: 5, items: ["potion_small"] } }, { returnState: false });
    }
  }

  it("hands over each new payout once, not the one already there when you arrive", async () => {
    const world = new LocalWorld(new PayingServer());
    const transport = new LocalTransport(world, "test-a");
    await transport.call("createCharacter", ["testa", "warrior", "0000"]);
    const a = new WorldClient(transport);
    // In, and seen in the room (a first pose) before anything is paid.
    const arrive = async () => {
      await a.enter();
      a.reportPose({ x: 10, z: 10, yaw: 0 });
      await world.idle();
    };
    await arrive();
    await world.call("test-a", a.state.entry!.roomId, "pay", ["old", 1]);
    await world.idle();
    expect(a.takePayouts()).toEqual([{ xp: 1, gold: 5, items: ["potion_small"] }]);
    // Arriving again, the old one is only noted.
    await arrive();
    expect(a.takePayouts()).toEqual([]);
    await world.call("test-a", a.state.entry!.roomId, "pay", ["new", 30]);
    await world.idle();
    expect(a.takePayouts()).toEqual([{ xp: 30, gold: 5, items: ["potion_small"] }]);
    expect(a.takePayouts()).toEqual([]);
  });
});

describe("WorldClient pose rate", () => {
  it("never sends more than ten poses a second, and still sends an attack made in between", async () => {
    let now = 0;
    const world = new LocalWorld(new Server());
    const transport = new LocalTransport(world, "test-a", () => now);
    await transport.call("createCharacter", ["testa", "warrior", "0000"]);
    const client = new WorldClient(transport, () => now);
    await client.enter();
    const sent: unknown[] = [];
    const call = transport.call.bind(transport);
    transport.call = ((name: string, args?: unknown[], options?: object) => {
      if (name === "reportPose") sent.push(args?.[0]);
      return call(name, args, options);
    }) as typeof transport.call;
    // One second of frames at 60 fps, attacking on every frame.
    for (let frame = 0; frame < 60; frame++) {
      now = frame * (1000 / 60);
      client.reportPose({ x: 5 + frame * 0.1, z: 5, yaw: 0, swing: frame });
    }
    expect(sent.length).toBeLessThanOrEqual(10);
    expect(sent.length).toBeGreaterThanOrEqual(8);
    // The last attack still goes out on the next frame the gap allows.
    now = 1000 + 200;
    client.reportPose({ x: 11, z: 5, yaw: 0, swing: 60 });
    expect((sent.at(-1) as { swing: number }).swing).toBe(60);
  });
});

describe("joining a room", () => {
  it("tries again when the room server turns the connection away for a moment", async () => {
    const { list: [a] } = await clients("test-a");
    const transport = (a as unknown as { transport: { joinRoom: (id: string) => Promise<void> } }).transport;
    const real = transport.joinRoom.bind(transport);
    let failures = 2;
    transport.joinRoom = async (id: string) => {
      if (failures-- > 0) throw Object.assign(new Error("RS connection failed"), { terminal: false });
      return real(id);
    };
    await a.enter();
    expect(a.state.phase).toBe("in");
  });

  it("gives up at once on a terminal refusal", async () => {
    const { list: [a] } = await clients("test-a");
    const transport = (a as unknown as { transport: { joinRoom: (id: string) => Promise<void> } }).transport;
    transport.joinRoom = async () => {
      throw Object.assign(new Error("RS connection failed"), { terminal: true });
    };
    await a.enter();
    expect(a.state.phase).toBe("error");
  });
});
