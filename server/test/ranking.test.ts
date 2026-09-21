import { levelOf } from "../../src/game/account/level";
import { giveXp, makeCharacter } from "./helpers";

// The board is written when a character's XP changes; hunting will do that (phase 2). Here the
// store writes it directly.
import { readProfile, writeRanking } from "../src/store";

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
    for (const [account, name, xp] of [["test-a", "앞선자", 500], ["test-b", "뒤선자", 20]] as const) {
      await makeCharacter(server, account, name);
      await giveXp(account, xp);
      await writeRanking(account, (await readProfile(account)).active!);
    }
    server.connect({ account: "test-b" });
    const view = await server.getRanking();
    expect(view.board.map((r: any) => r.nickname)).toEqual(["앞선자", "뒤선자"]);
    expect(view.rank).toBe(2);
  });
});
