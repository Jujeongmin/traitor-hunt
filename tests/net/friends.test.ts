import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import type { FriendEntry } from "../../src/game/account/friends";
import { FriendsClient, friendProblem, sortFriends } from "../../src/net/friends";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";

async function players(world: LocalWorld, ...names: string[]): Promise<FriendsClient[]> {
  const clients: FriendsClient[] = [];
  for (const [i, name] of names.entries()) {
    const transport = new LocalTransport(world, `test-${i}`);
    await transport.call("createCharacter", [name, "warrior", "0000"]);
    const client = new FriendsClient(transport);
    await client.start();
    clients.push(client);
  }
  return clients;
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("FriendsClient", () => {
  it("shows a request on the other screen without them asking", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker] = await players(world, "Hunter", "Seeker");
    expect(await hunter.request("seeker")).toBe("requested");
    await world.idle();
    expect(seeker.view?.incoming.map((f) => f.nickname)).toEqual(["Hunter"]);
    expect(hunter.view?.outgoing.map((f) => f.nickname)).toEqual(["Seeker"]);
  });

  it("updates both screens when a request is accepted, then removed", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker] = await players(world, "Hunter", "Seeker");
    await hunter.request("Seeker");
    await world.idle();
    await seeker.accept("test-0");
    await world.idle();
    expect(hunter.view?.friends).toEqual([{ account: "test-1", nickname: "Seeker", online: true }]);
    expect(seeker.view?.friends).toEqual([{ account: "test-0", nickname: "Hunter", online: true }]);
    await hunter.remove("test-1");
    await world.idle();
    expect(seeker.view).toEqual({ friends: [], incoming: [], outgoing: [] });
  });

  it("stops listening once disposed", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker] = await players(world, "Hunter", "Seeker");
    seeker.dispose();
    await hunter.request("Seeker");
    await world.idle();
    expect(seeker.view?.incoming).toEqual([]);
  });

  it("explains failures in Korean", async () => {
    const world = new LocalWorld(new Server());
    const [hunter] = await players(world, "Hunter");
    expect(friendProblem(await failure(hunter.request("Nobody")))).toBe("그런 닉네임을 찾지 못했어요");
    expect(friendProblem(await failure(hunter.request("Hunter")))).toBe("자기 자신은 추가할 수 없어요");
    expect(friendProblem(new Error("socket closed"))).toBe("지금은 할 수 없어요. 잠시 뒤 다시 시도해 주세요");
  });
});

describe("sortFriends", () => {
  it("puts online friends first, then by name", () => {
    const f = (nickname: string, online: boolean): FriendEntry => ({ account: nickname, nickname, online });
    expect(sortFriends([f("다", false), f("나", true), f("가", false), f("라", true)]).map((x) => x.nickname))
      .toEqual(["나", "라", "가", "다"]);
  });
});
