import { describe, expect, it } from "vitest";
import { RANKING_SIZE, rankOf, rankRows, type RankRow } from "../../src/game/account/ranking";

const row = (account: string, xp: number, wins = 0): RankRow => ({
  account, nickname: account.toUpperCase(), xp, level: 1, games: wins, wins,
});

describe("rankRows", () => {
  it("puts the most XP first and breaks a tie on wins, then on the name", () => {
    const ranked = rankRows([row("c", 50, 1), row("a", 90), row("b", 50, 4)]);
    expect(ranked.map((r) => r.account)).toEqual(["a", "b", "c"]);
  });

  it("keeps only the top of the board", () => {
    const many = Array.from({ length: RANKING_SIZE + 10 }, (_, i) => row(`p${i}`, i));
    const ranked = rankRows(many);
    expect(ranked).toHaveLength(RANKING_SIZE);
    expect(ranked[0].xp).toBe(RANKING_SIZE + 9);
  });

  it("drops rows that never finished a match and rows that are not rows", () => {
    const ranked = rankRows([row("a", 0), row("b", 10), null, { account: "c" }] as RankRow[]);
    expect(ranked.map((r) => r.account)).toEqual(["b"]);
  });
});

describe("rankOf", () => {
  it("is where an account sits on the board, or null when it is not on it", () => {
    const ranked = rankRows([row("a", 90), row("b", 50), row("c", 10)]);
    expect(rankOf(ranked, "a")).toBe(1);
    expect(rankOf(ranked, "c")).toBe(3);
    expect(rankOf(ranked, "nobody")).toBeNull();
  });
});
