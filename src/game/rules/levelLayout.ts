import type { SolidTest } from "./movement";
import { obstacleBlocks, obstaclesFor } from "./obstacles";
import { platformBlocks, platformsFor, type Platform } from "./platforms";

export interface Point2 { x: number; z: number }
export interface Gate { n: number; x: number; z: number }
export interface LevelLayout {
  tileSize: number;
  cols: number;
  rows: number;
  solid: boolean[][];
  playerSpawn: Point2;
  zombieSpawns: Point2[];
  exits: Point2[];
  shards: Point2[];
  devices: Point2[];
  altar: Point2 | null;
  waveSpawns: Point2[];
  bossSpawn: Point2 | null;
  gates: Gate[];
  // Crates and blocks to jump onto (see platforms.ts).
  platforms: Platform[];
}

export const TILE_SIZE = 4;

export const LEVEL_1: string[] = [
  "###########",
  "#P....#...#",
  "#.B...T...#",
  "#.....#.Z.#",
  "##.####...#",
  "#.....#.C.#",
  "#..Z.....E#",
  "###########",
];

// Plan 4 map. S rune shard, 1-3 gates, D device, A altar, W wave spawn, K boss, c low crate,
// H low crate beside a high block.
export const RUINS: string[] = [
  "#########################",
  "#P...H...S#.....H.......#",
  "#.........T.D.........D.#",
  "#..c....Z.#......Z..c...#",
  "#.........1.....#########",
  "#B........#..Z..2.......#",
  "###.#######...c.#.W...W.#",
  "#S..#######T###T#......c#",
  "#...########...#T...A...#",
  "############.K..#.......#",
  "###########c....3.W...W.#",
  "###########..E..#...H..C#",
  "#########################",
];

const GATE_SYMBOLS = new Set(["1", "2", "3"]);
const FLOOR_SYMBOLS = new Set([".", "P", "Z", "B", "C", "E", "S", "D", "A", "W", "K", "c", "H", ...GATE_SYMBOLS]);
const SOLID_SYMBOLS = new Set(["#", "T"]);

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

  const zombieSpawns: Point2[] = [];
  const exits: Point2[] = [];
  const shards: Point2[] = [];
  const devices: Point2[] = [];
  const waveSpawns: Point2[] = [];
  const gates: Gate[] = [];
  const platforms: Platform[] = [];
  // Asserted so TS keeps the wide types; they are assigned inside the callbacks below.
  let altar = null as Point2 | null;
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
      if (ch === "E") exits.push({ x, z });
      if (ch === "S") shards.push({ x, z });
      if (ch === "D") devices.push({ x, z });
      if (ch === "A") altar = { x, z };
      if (ch === "W") waveSpawns.push({ x, z });
      if (ch === "K") bossSpawn = { x, z };
      if (GATE_SYMBOLS.has(ch)) gates.push({ n: Number(ch), x, z });
    });
  });

  if (!playerSpawn) throw new Error("level has no player spawn (P)");
  gates.sort((a, b) => a.n - b.n);
  return {
    tileSize, cols, rows: rows.length, solid, playerSpawn, zombieSpawns, exits,
    shards, devices, altar, waveSpawns, bossSpawn, gates, platforms,
  };
}

export function solidAt(layout: LevelLayout, x: number, z: number): boolean {
  const c = Math.floor(x / layout.tileSize);
  const r = Math.floor(z / layout.tileSize);
  if (r < 0 || r >= layout.rows || c < 0 || c >= layout.cols) return true;
  return layout.solid[r][c];
}

// Gate cells are floor in the layout; a closed gate blocks its whole cell like a wall. Platforms taller
// than feetY + STEP_UP block too: monsters and bots are always on the floor (feetY 0); a player passes
// their feet height; Infinity leaves only walls and gates (for the camera and line of sight). The
// standing stones (obstacles.ts) block bodies; a path search leaves them out, since a stone stands in
// the middle of the cell it heads for and the last steps just slide round it.
export function solidWith(layout: LevelLayout, openGates: readonly number[], feetY = 0, stones = true): SolidTest {
  const half = layout.tileSize / 2;
  const closed = layout.gates.filter((g) => !openGates.includes(g.n));
  const obstacles = stones && Number.isFinite(feetY) ? obstaclesFor(layout) : [];
  return (x, z) =>
    solidAt(layout, x, z)
    || closed.some((g) => x >= g.x - half && x < g.x + half && z >= g.z - half && z < g.z + half)
    || platformBlocks(layout.platforms, x, z, feetY)
    || obstacleBlocks(obstacles, x, z);
}

const SPAWN_OFFSETS: Point2[] = [
  { x: -0.8, z: -0.8 },
  { x: 0.8, z: -0.8 },
  { x: -0.8, z: 0.8 },
  { x: 0.8, z: 0.8 },
];

export function spawnPoint(layout: LevelLayout, index: number): Point2 {
  const n = SPAWN_OFFSETS.length;
  const offset = SPAWN_OFFSETS[((index % n) + n) % n];
  return { x: layout.playerSpawn.x + offset.x, z: layout.playerSpawn.z + offset.z };
}
