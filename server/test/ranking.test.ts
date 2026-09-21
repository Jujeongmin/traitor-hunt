import { levelOf } from "../../src/game/account/level";

describe("ranking", () => {
  test("a fresh account sees an empty board", async (server) => {
    server.connect({ account: "test-a" });
    const view = await server.getRanking();
    expect(view.xp).toBe(0);
    expect(view.level).toEqual(levelOf(0));
    expect(view.rank).toBeNull();
    expect(view.board).toEqual([]);
  });

  test("puts characters on the board by XP, best first, with their names", async (server) => {
    await $global.updateUserState("test-a", { xp: 500 });
    await $global.updateUserState("test-b", { xp: 20 });
    server.connect({ account: "test-a" });
    await server.setNickname("앞선자");
    server.connect({ account: "test-b" });
    await server.setNickname("뒤선자");
    const view = await server.getRanking();
    expect(view.board.map((r: any) => r.account)).toEqual(["test-a", "test-b"]);
    expect(view.board[0].nickname).toBe("앞선자");
    expect(view.rank).toBe(2);
  });
});
