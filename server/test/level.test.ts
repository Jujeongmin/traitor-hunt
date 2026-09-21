import { FIRST_LEVEL_XP, levelOf } from "../../src/game/account/level";

describe("account level", () => {
  test("a fresh account is level 1 with nothing earned", async (server) => {
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.level).toEqual({ level: 1, into: 0, need: FIRST_LEVEL_XP });
    expect(view.xp).toBe(0);
  });

  test("comes from the XP saved on the account", async (server) => {
    await $global.updateUserState("test-a", { xp: 200 });
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.xp).toBe(200);
    expect(view.level).toEqual(levelOf(200));
  });

  test("survives renaming", async (server) => {
    await $global.updateUserState("test-a", { xp: 70 });
    server.connect({ account: "test-a" });
    const view = await server.setNickname("등반가");
    expect(view.nickname).toBe("등반가");
    expect(view.xp).toBe(70);
  });
});
