import { FULL_GAME_PRODUCT } from "../../src/game/account/purchase";

// Real Verse8 accounts are wallet addresses; "test-" accounts are the local practice and test seats.
const BUYER = "0x1111111111111111111111111111111111111111";

const purchase = (account: string, purchaseId: string, productId = FULL_GAME_PRODUCT) => ({
  account, purchaseId, productId, quantity: 1,
});

describe("buying the full game", () => {
  test("a new account does not own it", async (server) => {
    server.connect({ account: BUYER });
    expect((await server.getAccount()).owned).toBe(false);
  });

  test("the platform's purchase event unlocks the full game", async (server) => {
    expect(await server.$onItemPurchased(purchase(BUYER, "p-1"))).toEqual({ success: true, code: "granted" });
    server.connect({ account: BUYER });
    expect((await server.getAccount()).owned).toBe(true);
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

  test("test accounts play without buying", async (server) => {
    server.connect({ account: "test-a" });
    expect((await server.getAccount()).owned).toBe(true);
  });
});
