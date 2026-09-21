import { FIRST_LEVEL_XP, XP_PER_GAME, XP_PER_WIN, levelOf, xpOf } from "../../src/game/account/level";
import { emptyProfile } from "../../src/game/match/profile";

describe("account level", () => {
  test("a fresh account is level 1 with nothing earned", async (server) => {
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.level).toEqual({ level: 1, into: 0, need: FIRST_LEVEL_XP });
    expect(view.xp).toBe(0);
  });

  test("comes from the matches the account has played", async (server) => {
    const profile = { ...emptyProfile(), games: 4, wins: 2, escapes: 1, monsterKills: 5 };
    await $global.updateUserState("test-a", { profile });
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.xp).toBe(xpOf(profile));
    expect(view.level).toEqual(levelOf(xpOf(profile)));
    expect(view.level.level).toBeGreaterThan(1);
  });

  test("survives renaming and comes back with the new name", async (server) => {
    await $global.updateUserState("test-a", { profile: { ...emptyProfile(), games: 1, wins: 1 } });
    server.connect({ account: "test-a" });
    const view = await server.setNickname("등반가");
    expect(view.nickname).toBe("등반가");
    expect(view.xp).toBe(XP_PER_GAME + XP_PER_WIN);
  });
});
