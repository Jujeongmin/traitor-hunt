import { describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { CallThrottle } from "../../src/net/throttle";
import { Verse8Transport, type Verse8Server } from "../../src/net/verse8Transport";

describe("CallThrottle", () => {
  it("lets one call through per window, per key", () => {
    const t = new CallThrottle();
    expect(t.allow("a", 100, 0)).toBe(true);
    expect(t.allow("a", 100, 99)).toBe(false);
    expect(t.allow("b", 100, 99)).toBe(true);
    expect(t.allow("a", 100, 100)).toBe(true);
  });
});

describe("LocalTransport", () => {
  it("remembers the room from enterWorld and forgets it after leaveWorld", async () => {
    const world = new LocalWorld(new Server());
    const t = new LocalTransport(world, "test-a");
    await t.call("createCharacter", ["에이", "warrior", "0000"]);
    const { roomId } = await t.call<{ roomId: string }>("enterWorld");
    await t.joinRoom(roomId);
    await t.call("arrive");
    await expect(t.call("reportPose", [{ x: 5, z: 5, yaw: 0 }])).resolves.toBeUndefined();
    await t.call("leaveWorld");
    t.leaveRoom();
    await world.idle();
    expect(world.roomState(roomId).$users).toEqual([]);
    await expect(t.call("reportPose", [{ x: 5, z: 5, yaw: 0 }])).rejects.toThrow("unavailable");
  });

  it("does not wait for or report errors when no response is needed", async () => {
    const world = new LocalWorld(new Server());
    const t = new LocalTransport(world, "test-a");
    await expect(t.call("travel", ["moon"], { needResponse: false })).resolves.toBeUndefined();
    await world.idle();
  });

  it("drops calls inside the throttle window", async () => {
    let now = 0;
    const world = new LocalWorld(new Server());
    const spy = vi.spyOn(world, "call");
    const t = new LocalTransport(world, "test-a", () => now);
    await t.call("getServerVersion", [], { throttle: 100 });
    await t.call("getServerVersion", [], { throttle: 100 });
    now = 100;
    await t.call("getServerVersion", [], { throttle: 100 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("delivers room messages meant for this account or everyone", async () => {
    const world = new LocalWorld(new Server());
    const a = new LocalTransport(world, "test-a");
    const got: unknown[] = [];
    a.onRoomMessage("r1", "hello", (m) => got.push(m));
    const emit = (world as unknown as { listeners: Set<(e: unknown) => void> }).listeners;
    for (const l of emit) {
      l({ kind: "message", roomId: "r1", to: null, type: "hello", message: 1 });
      l({ kind: "message", roomId: "r1", to: "test-a", type: "hello", message: 2 });
      l({ kind: "message", roomId: "r1", to: "test-b", type: "hello", message: 3 });
      l({ kind: "message", roomId: "r2", to: null, type: "hello", message: 4 });
      l({ kind: "message", roomId: "r1", to: null, type: "other", message: 5 });
    }
    expect(got).toEqual([1, 2]);
  });

  it("passes room state and user lists for its room", async () => {
    const world = new LocalWorld(new Server());
    const a = new LocalTransport(world, "test-a");
    const states: Record<string, unknown>[] = [];
    const users: unknown[][] = [];
    const roomId = "rpg-w1-village-1";
    a.subscribeRoomState(roomId, (s) => states.push(s));
    a.subscribeRoomUsers(roomId, (u) => users.push(u));
    await a.call("createCharacter", ["에이", "warrior", "0000"]);
    await a.call("enterWorld");
    await a.joinRoom(roomId);
    await a.call("arrive");
    await a.call("reportPose", [{ x: 1, z: 2, yaw: 0 }]);
    expect(users.at(-1)).toMatchObject([{ account: "test-a", pose: { x: 1, z: 2, yaw: 0 } }]);
    expect(states.at(-1)).toMatchObject({ roomId, $users: ["test-a"] });
  });

  it("passes only its own account state", async () => {
    const world = new LocalWorld(new Server());
    const a = new LocalTransport(world, "test-a");
    const b = new LocalTransport(world, "test-b");
    const mine: Record<string, unknown>[] = [];
    a.subscribeMyState((s) => mine.push(s));
    await b.call("createCharacter", ["Seeker", "warrior", "0000"]);
    expect(mine).toEqual([]);
    await a.call("createCharacter", ["Hunter", "warrior", "0000"]);
    expect(mine.at(-1)).toMatchObject({ nickname: "Hunter" });
  });
});

describe("Verse8Transport", () => {
  it("forwards everything to the Verse8 SDK", async () => {
    const off = () => {};
    const server = {
      account: "0xabc",
      remoteFunction: vi.fn(async () => "ok"),
      subscribeRoomState: vi.fn(() => off),
      subscribeRoomAllUserStates: vi.fn(() => off),
      onRoomMessage: vi.fn(() => off),
      subscribeGlobalMyState: vi.fn(() => off),
    };
    const rooms = { joinRoom: vi.fn(async () => undefined), leaveRoom: vi.fn() };
    const t = new Verse8Transport(server as unknown as Verse8Server, rooms);
    expect(t.account).toBe("0xabc");
    await expect(t.call("reportPose", [1], { needResponse: false, throttle: 100 })).resolves.toBe("ok");
    expect(server.remoteFunction).toHaveBeenCalledWith("reportPose", [1], { needResponse: false, throttle: 100 });
    const cb = () => {};
    expect(t.subscribeRoomState("r", cb)).toBe(off);
    expect(t.subscribeRoomUsers("r", cb)).toBe(off);
    expect(t.onRoomMessage("r", "pain", cb)).toBe(off);
    expect(t.subscribeMyState(cb)).toBe(off);
    expect(server.subscribeGlobalMyState).toHaveBeenCalledWith(cb);
    expect(server.subscribeRoomState).toHaveBeenCalledWith("r", cb);
    expect(server.subscribeRoomAllUserStates).toHaveBeenCalledWith("r", cb);
    expect(server.onRoomMessage).toHaveBeenCalledWith("r", "pain", cb);
    await t.joinRoom("rpg-w1-village-1");
    t.leaveRoom();
    expect(rooms.joinRoom).toHaveBeenCalledWith("rpg-w1-village-1");
    expect(rooms.leaveRoom).toHaveBeenCalled();
  });
});
