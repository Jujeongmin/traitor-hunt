import { errorOf } from "./helpers";

async function named(server: any, account: string, nickname: string): Promise<void> {
  server.connect({ account });
  await server.createCharacter(nickname, "warrior", "0000");
}

describe("friends", () => {
  test("a request by nickname waits in the other player's list", async (server) => {
    await named(server, "test-b", "Seeker");
    await named(server, "test-a", "Hunter");
    await server.syncFriends();
    expect(await server.requestFriend("seeker")).toEqual({ status: "requested" });
    expect((await server.syncFriends()).outgoing).toEqual([{ account: "test-b", nickname: "Seeker", online: false }]);
    server.connect({ account: "test-b" });
    const view = await server.syncFriends();
    expect(view.incoming).toEqual([{ account: "test-a", nickname: "Hunter", online: true }]);
    expect(view.friends).toEqual([]);
  });

  test("accepting makes both friends, and asking back accepts too", async (server) => {
    await named(server, "test-a", "Hunter");
    await named(server, "test-b", "Seeker");
    await named(server, "test-c", "Raider");
    server.connect({ account: "test-a" });
    await server.requestFriend("Seeker");
    await server.requestFriend("Raider");
    server.connect({ account: "test-b" });
    await server.acceptFriend("test-a");
    server.connect({ account: "test-c" });
    expect(await server.requestFriend("Hunter")).toEqual({ status: "accepted" });
    server.connect({ account: "test-a" });
    const view = await server.syncFriends();
    expect(view.friends.map((f: any) => f.nickname)).toEqual(["Seeker", "Raider"]);
    expect([view.incoming, view.outgoing]).toEqual([[], []]);
  });

  test("removing clears the link on both sides", async (server) => {
    await named(server, "test-a", "Hunter");
    await named(server, "test-b", "Seeker");
    server.connect({ account: "test-a" });
    await server.requestFriend("Seeker");
    server.connect({ account: "test-b" });
    await server.acceptFriend("test-a");
    await server.removeFriend("test-a");
    expect(await server.syncFriends()).toEqual({ friends: [], incoming: [], outgoing: [] });
    server.connect({ account: "test-a" });
    expect(await server.syncFriends()).toEqual({ friends: [], incoming: [], outgoing: [] });
  });

  test("explains what went wrong", async (server) => {
    await named(server, "test-a", "Hunter");
    expect(await errorOf(server.requestFriend("Nobody"))).toContain("friend_not_found");
    expect(await errorOf(server.requestFriend("hunter"))).toContain("friend_self");
    expect(await errorOf(server.acceptFriend("test-b"))).toContain("no_request");
    expect(await errorOf(server.acceptFriend(42))).toContain("unavailable");
    expect(await errorOf(server.requestFriend(null))).toContain("friend_not_found");
  });

  test("you need a nickname before you can ask", async (server) => {
    await named(server, "test-b", "Seeker");
    server.connect({ account: "test-a" });
    expect(await errorOf(server.requestFriend("Seeker"))).toContain("unavailable");
  });
});

describe("removeFriend on a stranger", () => {
  test("writes nothing to their account", async (server) => {
    server.connect({ account: "test-a" });
    await server.removeFriend("test-stranger");
    expect(await $global.getUserState("test-stranger")).toEqual({});
  });
});
