import { FULL_GAME_PRODUCT } from "../../src/game/account/purchase";
import { errorOf } from "./helpers";

// Real Verse8 accounts are wallet addresses; "test-" accounts are the local practice and test seats.
const BUYER = "0x1111111111111111111111111111111111111111";
const FRIEND = "0x2222222222222222222222222222222222222222";

const purchase = (account: string, purchaseId: string, productId = FULL_GAME_PRODUCT) => ({
  account, purchaseId, productId, quantity: 1,
});

describe("buying the full game", () => {
  test("a new account does not own it, and cannot start an online match", async (server) => {
    server.connect({ account: BUYER });
    expect((await server.getAccount()).owned).toBe(false);
    expect(await errorOf(server.findMatch())).toContain("not_owned");
  });

  test("the platform's purchase event unlocks online play", async (server) => {
    expect(await server.$onItemPurchased(purchase(BUYER, "p-1"))).toEqual({ success: true, code: "granted" });
    server.connect({ account: BUYER });
    expect((await server.getAccount()).owned).toBe(true);
    expect((await server.findMatch()).roomId).toBeTruthy();
  });

  test("the same receipt twice grants once and still reports success", async (server) => {
    await server.$onItemPurchased(purchase(BUYER, "p-1"));
    expect(await server.$onItemPurchased(purchase(BUYER, "p-1"))).toEqual({ success: true, code: "already_granted" });
    expect(await $global.countCollectionItems("purchases")).toBe(1);
  });

  test("turns away products it does not sell and broken events", async (server) => {
    expect((await server.$onItemPurchased(purchase(BUYER, "p-2", "gold-pack"))).success).toBe(false);
    expect((await server.$onItemPurchased({ account: BUYER })).success).toBe(false);
    server.connect({ account: BUYER });
    expect((await server.getAccount()).owned).toBe(false);
  });

  test("a leader who owns it brings the whole party, bought or not", async (server) => {
    await server.$onItemPurchased(purchase(BUYER, "p-1"));
    for (const [account, name] of [[BUYER, "구매자"], [FRIEND, "친구"]]) {
      server.connect({ account });
      await server.setNickname(name);
      await server.syncFriends();
    }
    server.connect({ account: BUYER });
    await server.requestFriend("친구");
    server.connect({ account: FRIEND });
    await server.acceptFriend(BUYER);
    server.connect({ account: BUYER });
    await server.inviteToParty(FRIEND);
    server.connect({ account: FRIEND });
    await server.acceptPartyInvite(BUYER);
    await server.syncParty("menu");
    server.connect({ account: BUYER });
    await server.syncParty("menu");

    // The friend cannot start for the party, but the leader seats them.
    server.connect({ account: FRIEND });
    expect(await errorOf(server.findMatch())).toContain("not_leader");
    server.connect({ account: BUYER });
    const { roomId } = await server.findMatch();
    expect((await $global.getRoomState(roomId)).match.players).toContain(FRIEND);
  });

  test("test accounts play without buying", async (server) => {
    server.connect({ account: "test-a" });
    expect((await server.findMatch()).roomId).toBeTruthy();
  });
});
