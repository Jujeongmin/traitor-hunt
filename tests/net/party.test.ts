import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { PartyClient, partyProblem } from "../../src/net/party";

// Named players who are all friends of the first one, each with a running PartyClient.
async function lobby(world: LocalWorld, ...names: string[]): Promise<PartyClient[]> {
  const transports = names.map((_, i) => new LocalTransport(world, `test-${i}`));
  for (const [i, t] of transports.entries()) {
    await t.call("setNickname", [names[i]]);
    await t.call("syncFriends");
  }
  for (const [i, t] of transports.entries()) {
    if (i === 0) continue;
    await transports[0].call("requestFriend", [names[i]]);
    await t.call("acceptFriend", ["test-0"]);
  }
  const clients = transports.map((t) => new PartyClient(t));
  for (const c of clients) await c.start();
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

const accounts = (client: PartyClient) => client.view?.party?.members.map((m) => m.account) ?? null;

describe("PartyClient", () => {
  it("shows an invite at once, and the party on both screens after accepting", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker] = await lobby(world, "Hunter", "Seeker");
    await hunter.invite("test-1");
    await world.idle();
    expect(seeker.view?.invites).toEqual([{ account: "test-0", nickname: "Hunter" }]);
    await seeker.accept("test-0");
    await world.idle();
    expect(accounts(hunter)).toEqual(["test-0", "test-1"]);
    expect(accounts(seeker)).toEqual(["test-0", "test-1"]);
    expect(hunter.view?.party?.leader).toBe("test-0");
    expect(seeker.view?.invites).toEqual([]);
  });

  it("tells the others when someone leaves", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker, raider] = await lobby(world, "Hunter", "Seeker", "Raider");
    for (const [client, account] of [[seeker, "test-1"], [raider, "test-2"]] as const) {
      await hunter.invite(account);
      await world.idle();
      await client.accept("test-0");
    }
    await world.idle();
    await raider.leave();
    await world.idle();
    expect(accounts(hunter)).toEqual(["test-0", "test-1"]);
    expect(raider.view?.party).toBeNull();
  });

  it("shows each member's costume", async () => {
    const world = new LocalWorld(new Server());
    const [hunter, seeker] = await lobby(world, "Hunter", "Seeker");
    await seeker.setCostume("11111111");
    await hunter.invite("test-1");
    await world.idle();
    await seeker.accept("test-0");
    await world.idle();
    expect(hunter.view?.party?.members.map((m) => m.costume)).toEqual(["00000000", "11111111"]);
  });

  it("explains failures in Korean", async () => {
    const world = new LocalWorld(new Server());
    const [, seeker] = await lobby(world, "Hunter", "Seeker");
    expect(partyProblem(await failure(seeker.accept("test-0")))).toBe("초대가 만료되었어요");
    expect(partyProblem(new Error("socket closed"))).toBe("지금은 할 수 없어요. 잠시 뒤 다시 시도해 주세요");
  });
});
