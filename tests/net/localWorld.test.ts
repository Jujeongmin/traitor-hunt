import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld, type WorldEvent } from "../../src/net/local/localWorld";

const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

// Makes a character for the account, then walks it into the world as a Verse8 2.0 client does:
// the server picks the room, the client joins it and arrives from inside.
async function enter(world: LocalWorld, account: string): Promise<{ roomId: string }> {
  await world.call(account, null, "createCharacter", [`p${account.replace(/[^a-z0-9]/g, "")}`, "warrior", "0000"]);
  const entry = (await world.call(account, null, "enterWorld")) as { roomId: string };
  await world.join(account, entry.roomId);
  await world.call(account, entry.roomId, "arrive");
  return entry;
}

async function enterAll(world: LocalWorld): Promise<string> {
  let roomId = "";
  for (const p of PLAYERS) roomId = (await enter(world, p)).roomId;
  return roomId;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}


// The server holds reported poses to walking pace; a minute on, any spot is in reach.
function aMinuteLater(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 60_000);
}

describe("LocalWorld", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the real server: everyone lands in the same village channel", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await enterAll(world);
    expect(roomId).toBe("rpg-w1-village-1");
    expect(world.roomState(roomId).$users).toEqual(PLAYERS);
  });

  it("reports user states as account plus state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await enterAll(world);
    const events: WorldEvent[] = [];
    world.subscribe((e) => events.push(e));
    aMinuteLater();
    await world.call(PLAYERS[2], roomId, "reportPose", [{ x: 5, z: 6, yaw: 3 }]);
    const users = events.find((e) => e.kind === "roomUsers") as Extract<WorldEvent, { kind: "roomUsers" }>;
    const mine = users.users.find((u) => u.account === PLAYERS[2])!;
    expect([mine.pose.x, mine.pose.z, mine.pose.yaw]).toEqual([5, 6, 3]);
  });

  it("passes rule errors through and refuses unknown or hook functions", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await enterAll(world);
    expect(await codeOf(world.call(PLAYERS[0], roomId, "travel", ["boss"]))).toContain("no_zone");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "nope"))).toContain("unknown server function");
    expect(await codeOf(world.call(PLAYERS[0], roomId, "$onItemPurchased", [{}]))).toContain("unknown server function");
  });

  it("serializes overlapping calls and restores the globals afterwards", async () => {
    const world = new LocalWorld(new Server());
    const results = await Promise.all(PLAYERS.map((p) => enter(world, p)));
    expect(new Set(results.map((r) => (r as { roomId: string }).roomId)).size).toBe(1);
    expect((globalThis as Record<string, unknown>).$global).toBeUndefined();
    expect((globalThis as Record<string, unknown>).$sender).toBeUndefined();
  });

  it("keeps two worlds apart even when their calls overlap", async () => {
    const first = new LocalWorld(new Server());
    const second = new LocalWorld(new Server());
    const calls: Promise<unknown>[] = [];
    for (const p of PLAYERS) {
      calls.push(enter(first, p));
      calls.push(enter(second, `${p}-2`));
    }
    const ids = (await Promise.all(calls)).map((r) => (r as { roomId: string }).roomId);
    expect(first.roomState(ids[0]).$users).toEqual(PLAYERS);
    expect(second.roomState(ids[1]).$users).toEqual(PLAYERS.map((p) => `${p}-2`));
  });

  it("copies values so callers cannot change stored state", async () => {
    const world = new LocalWorld(new Server());
    const roomId = await enterAll(world);
    const state = world.roomState(roomId) as { $users: string[] };
    state.$users.push("intruder");
    expect(world.roomState(roomId).$users).toEqual(PLAYERS);
  });

  it("drops a player from the room list when they leave", async () => {
    const world = new LocalWorld(new Server());
    const first = await enter(world, "test-x");
    await world.call("test-x", first.roomId, "leaveWorld");
    await world.leave("test-x", first.roomId);
    expect(world.roomState(first.roomId).$users).toEqual([]);
  });
});
