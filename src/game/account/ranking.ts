import type { Profile } from "../match/profile";
import type { LevelView } from "./level";

// One line of the board. The server keeps one per account, refreshed when a match ends or a
// nickname changes, so the board needs no scan over every account.
export interface RankRow {
  account: string;
  nickname: string | null;
  xp: number;
  level: number;
  games: number;
  wins: number;
}

// How many lines the board shows.
export const RANKING_SIZE = 20;

function isRow(value: unknown): value is RankRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.account === "string"
    && [row.xp, row.level, row.games, row.wins].every((n) => typeof n === "number" && Number.isFinite(n));
}

// Most XP first; between equals, more wins, then the name, so the order never wobbles.
export function rankRows(rows: readonly RankRow[]): RankRow[] {
  return rows
    .filter((row) => isRow(row) && row.xp > 0)
    .slice()
    .sort((a, b) => b.xp - a.xp || b.wins - a.wins || a.account.localeCompare(b.account))
    .slice(0, RANKING_SIZE);
}

// The place an account holds on a ranked board, counting from 1.
export function rankOf(ranked: readonly RankRow[], account: string): number | null {
  const index = ranked.findIndex((row) => row.account === account);
  return index < 0 ? null : index + 1;
}

// What the stats screen shows: your own record and the board you sit on.
export interface StatsView {
  profile: Profile;
  xp: number;
  level: LevelView;
  // Where you sit on the board, or null while you are not on it.
  rank: number | null;
  board: RankRow[];
}
