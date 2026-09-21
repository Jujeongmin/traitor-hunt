import { errorOf } from "./helpers";

describe("class and costume", () => {
  test("takes only classes it knows, and the account remembers it", async (server) => {
    server.connect({ account: "test-a" });
    expect(await errorOf(server.setClass("archer"))).toContain("unavailable");
    await server.setClass("rogue");
    expect((await $global.getUserState("test-a")).playerClass).toBe("rogue");
    expect((await server.getAccount()).playerClass).toBe("rogue");
  });

  test("a new character has no class yet", async (server) => {
    server.connect({ account: "test-a" });
    expect((await server.getAccount()).playerClass).toBeNull();
  });

  test("takes only costumes it knows", async (server) => {
    server.connect({ account: "test-a" });
    await server.setCostume("1413");
    expect((await $global.getUserState("test-a")).costume).toBe("1413");
    expect(await errorOf(server.setCostume("golden-armour"))).toContain("unavailable");
  });
});
