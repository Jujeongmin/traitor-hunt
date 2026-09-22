import type { SolidTest } from "./movement";
import { platformBlocks, platformsFor, type Platform } from "./platforms";

export interface Point2 { x: number; z: number }
export interface LevelLayout {
  tileSize: number;
  cols: number;
  rows: number;
  solid: boolean[][];
  // The solid cells that are forest (the rest are houses): only these grow trees.
  forest: boolean[][];
  playerSpawn: Point2;
  // Where monsters stand (phase 2), and the boss.
  zombieSpawns: Point2[];
  bossSpawn: Point2 | null;
  // Crates and blocks to jump onto (see platforms.ts).
  platforms: Platform[];
  // O cells: the ways to other zones, in reading order (see zones.ts).
  portals: Point2[];
}

export const TILE_SIZE = 4;

// # forest, h a house's cell; everything else is ground: P spawn, Z monster, K boss, O portal,
// c B C H platforms.
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "K", "O", "c", "B", "H"]);
const SOLID_SYMBOLS = new Set(["#", "h"]);

export function parseLevel(rows: string[], tileSize: number): LevelLayout {
  const cols = rows[0]?.length ?? 0;
  rows.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`row ${r} has ${row.length} cells, expected ${cols}`);
    for (const ch of row) {
      if (!FLOOR_SYMBOLS.has(ch) && !SOLID_SYMBOLS.has(ch)) throw new Error(`unknown symbol "${ch}" in row ${r}`);
    }
  });

  const center = (c: number, r: number): Point2 => ({ x: (c + 0.5) * tileSize, z: (r + 0.5) * tileSize });
  const solid = rows.map((row) => [...row].map((ch) => SOLID_SYMBOLS.has(ch)));
  const forest = rows.map((row) => [...row].map((ch) => ch === "#"));

  const zombieSpawns: Point2[] = [];
  const platforms: Platform[] = [];
  const portals: Point2[] = [];
  // Asserted so TS keeps the wide types; they are assigned inside the callbacks below.
  let bossSpawn = null as Point2 | null;
  // Asserted so TS keeps the wide type; it is assigned inside the callbacks below.
  let playerSpawn = null as Point2 | null;

  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const { x, z } = center(c, r);
      if (SOLID_SYMBOLS.has(ch)) return;
      platforms.push(...platformsFor(ch, x, z));
      if (ch === "P") playerSpawn = { x, z };
      if (ch === "Z") zombieSpawns.push({ x, z });
      if (ch === "K") bossSpawn = { x, z };
      if (ch === "O") portals.push({ x, z });
    });
  });

  if (!playerSpawn) throw new Error("level has no player spawn (P)");
  return { tileSize, cols, rows: rows.length, solid, forest, playerSpawn, zombieSpawns, bossSpawn, platforms, portals };
}

export function solidAt(layout: LevelLayout, x: number, z: number): boolean {
  const c = Math.floor(x / layout.tileSize);
  const r = Math.floor(z / layout.tileSize);
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return true;
  return layout.solid[r][c];
}

// What stops a body with its feet at feetY: the forest, and platforms taller than feetY + STEP_UP.
// Monsters are always on the floor (feetY 0); a player passes their feet height; Infinity leaves only
// the forest (for the camera).
export function solidWith(layout: LevelLayout, feetY = 0): SolidTest {
  return (x, z) => solidAt(layout, x, z) || platformBlocks(layout.platforms, x, z, feetY);
}
