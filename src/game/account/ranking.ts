import type { LevelView } from "./level";

// One line of the board. The server keeps one per character, refreshed when its XP or its name
// changes, so the board needs no scan over every account.
export interface RankRow {
  // The character.
  id: string;
  account: string;
  nickname: string | null;
  xp: number;
  level: number;
}

// How many lines the board shows.
export const RANKING_SIZE = 20;

function isRow(value: unknown): value is RankRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.account === "string" && [row.xp, row.level].every((n) => typeof n === "number" && Number.isFinite(n));
}

// Most XP first; between equals, the account, so the order never wobbles.
export function rankRows(rows: readonly RankRow[]): RankRow[] {
  return rows
    .filter((row) => isRow(row) && row.xp > 0)
    .map(({ id, account, nickname, xp, level }) => ({ id, account, nickname, xp, level }))
    .sort((a, b) => b.xp - a.xp || a.id.localeCompare(b.id))
    .slice(0, RANKING_SIZE);
}

// The place a character holds on a ranked board, counting from 1.
export function rankOf(ranked: readonly RankRow[], character: string): number | null {
  const index = ranked.findIndex((row) => row.id === character);
  return index < 0 ? null : index + 1;
}

// What the ranking screen shows: your character's level and the board it sits on.
export interface RankingView {
  xp: number;
  level: LevelView;
  // Where you sit on the board, or null while you are not on it.
  rank: number | null;
  board: RankRow[];
}
