import { errorOf } from "./helpers";

const NAMES: Record<string, string> = {
  "test-a": "Hunter", "test-b": "Seeker", "test-c": "Raider", "test-d": "Crow", "test-e": "Owl",
};

function as(server: any, account: string): any {
  server.connect({ account });
  return server;
}

// Everyone gets a name and comes online; test-a befriends each of `friends`.
async function setup(server: any, friends: string[] = ["test-b", "test-c", "test-d", "test-e"]): Promise<void> {
  for (const [account, name] of Object.entries(NAMES)) {
    await as(server, account).createCharacter(name, "warrior", "0000");
    await server.syncFriends();
  }
  for (const account of friends) {
    await as(server, "test-a").requestFriend(NAMES[account]);
    await as(server, account).acceptFriend("test-a");
  }
}

async function partyOf(server: any, account: string): Promise<any> {
  return (await as(server, account).syncParty()).party;
}

describe("party invites", () => {
  test("an accepted invite puts both in a party led by the inviter", async (server) => {
    await setup(server);
    await as(server, "test-a").inviteToParty("test-b");
    expect((await as(server, "test-b").syncParty()).invites).toEqual([{ account: "test-a", nickname: "Hunter" }]);
    await server.acceptPartyInvite("test-a");
    const party = await partyOf(server, "test-a");
    expect(party.leader).toBe("test-a");
    expect(party.members).toEqual([
      { account: "test-a", nickname: "Hunter", costume: "0000", playerClass: "warrior", online: true, activity: "menu" },
      { account: "test-b", nickname: "Seeker", costume: "0000", playerClass: "warrior", online: true, activity: "menu" },
    ]);
    expect((await as(server, "test-b").syncParty()).invites).toEqual([]);
  });

  test("only friends, and only four", async (server) => {
    await setup(server);
    expect(await errorOf(as(server, "test-b").inviteToParty("test-c"))).toContain("not_friends");
    for (const account of ["test-b", "test-c", "test-d"]) {
      await as(server, "test-a").inviteToParty(account);
      await as(server, account).acceptPartyInvite("test-a");
    }
    expect(await errorOf(as(server, "test-a").inviteToParty("test-b"))).toContain("already_in_party");
    expect(await errorOf(as(server, "test-a").inviteToParty("test-e"))).toContain("party_full");
    expect((await partyOf(server, "test-d")).members).toHaveLength(4);
  });

  test("needs a live invite; declining removes it", async (server) => {
    await setup(server);
    expect(await errorOf(as(server, "test-b").acceptPartyInvite("test-a"))).toContain("no_invite");
    await as(server, "test-a").inviteToParty("test-b");
    await as(server, "test-b").declinePartyInvite("test-a");
    expect((await server.syncParty()).invites).toEqual([]);
    expect(await errorOf(server.acceptPartyInvite("test-a"))).toContain("no_invite");
  });

  test("joining another party leaves the old one", async (server) => {
    await setup(server, ["test-b", "test-c"]);
    await as(server, "test-c").requestFriend("Crow");
    await as(server, "test-d").acceptFriend("test-c");
    await as(server, "test-a").inviteToParty("test-b");
    await as(server, "test-b").acceptPartyInvite("test-a");
    await as(server, "test-c").inviteToParty("test-d");
    await as(server, "test-d").acceptPartyInvite("test-c");
    await as(server, "test-a").inviteToParty("test-c");
    await as(server, "test-c").acceptPartyInvite("test-a");
    expect((await partyOf(server, "test-c")).members.map((m: any) => m.account)).toEqual(["test-a", "test-b", "test-c"]);
    expect(await partyOf(server, "test-d")).toBeNull();
  });
});

describe("leaving a party", () => {
  test("passes the lead on and ends a party of one", async (server) => {
    await setup(server);
    for (const account of ["test-b", "test-c"]) {
      await as(server, "test-a").inviteToParty(account);
      await as(server, account).acceptPartyInvite("test-a");
    }
    await as(server, "test-a").leaveParty();
    expect(await partyOf(server, "test-a")).toBeNull();
    expect((await partyOf(server, "test-b")).leader).toBe("test-b");
    await as(server, "test-c").leaveParty();
    expect(await partyOf(server, "test-b")).toBeNull();
    expect(await partyOf(server, "test-c")).toBeNull();
  });

  test("the leader can remove a member; nobody else can", async (server) => {
    await setup(server);
    for (const account of ["test-b", "test-c"]) {
      await as(server, "test-a").inviteToParty(account);
      await as(server, account).acceptPartyInvite("test-a");
    }
    expect(await errorOf(as(server, "test-b").kickFromParty("test-c"))).toContain("not_leader");
    await as(server, "test-a").kickFromParty("test-c");
    expect(await partyOf(server, "test-c")).toBeNull();
    expect((await partyOf(server, "test-a")).members.map((m: any) => m.account)).toEqual(["test-a", "test-b"]);
  });

  test("members who stop sending heartbeats drop out", async (server) => {
    await setup(server);
    for (const account of ["test-b", "test-c"]) {
      await as(server, "test-a").inviteToParty(account);
      await as(server, account).acceptPartyInvite("test-a");
    }
    await $global.updateUserState("test-c", { lastSeenAt: 0 });
    expect((await partyOf(server, "test-a")).members.map((m: any) => m.account)).toEqual(["test-a", "test-b"]);
    expect(await partyOf(server, "test-c")).toBeNull();
  });
});
