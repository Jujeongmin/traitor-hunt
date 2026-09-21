import { levelOf, xpOf } from "../../src/game/account/level";
import { emptyProfile } from "../../src/game/match/profile";
import { PLAYERS, actAs, fillRoom, findTraitor } from "./helpers";

describe("stats and ranking", () => {
  test("a fresh account has an empty record and an empty board", async (server) => {
    server.connect({ account: "test-a" });
    const stats = await server.getStats();
    expect(stats.profile).toEqual(emptyProfile());
    expect(stats.xp).toBe(0);
    expect(stats.level).toEqual(levelOf(0));
    expect(stats.rank).toBeNull();
    expect(stats.board).toEqual([]);
  });

  test("a finished match puts the players on the board, best first", async (server) => {
    await $global.updateUserState("test-a", { profile: { ...emptyProfile(), games: 9, wins: 9 } });
    await $global.updateUserState("test-b", { profile: { ...emptyProfile(), games: 1 } });
    server.connect({ account: "test-a" });
    await server.setNickname("앞선자");
    server.connect({ account: "test-b" });
    await server.setNickname("뒤선자");

    server.connect({ account: "test-b" });
    const stats = await server.getStats();
    expect(stats.board.map((r: any) => r.account)).toEqual(["test-a", "test-b"]);
    expect(stats.board[0].nickname).toBe("앞선자");
    expect(stats.rank).toBe(2);
    expect(stats.xp).toBe(xpOf({ ...emptyProfile(), games: 1 }));
  });

  test("the board follows the matches that are actually played", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurers = PLAYERS.filter((p) => p !== traitor);
    for (const account of adventurers) {
      actAs(server, account, roomId);
      await server.leaveMatch();
    }
    actAs(server, traitor, roomId);
    expect((await server.getMatchState()).match.phase).toBe("ended");
    const stats = await server.getStats();
    expect(stats.profile).toMatchObject({ games: 1, wins: 1 });
    expect(stats.xp).toBeGreaterThan(0);
    expect(stats.board[0].account).toBe(traitor);
    expect(stats.rank).toBe(1);
  });
});
