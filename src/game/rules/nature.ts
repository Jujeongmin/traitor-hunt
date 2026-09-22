import type { LevelLayout, Point2 } from "./levelLayout";
import { PATH_HALF_WIDTH, pathDistance } from "./paths";

// The outdoor dressing for a grid level: forest and rocks where the map is solid, a few plants on
// the open ground. Quaternius' Stylized Nature MegaKit (CC0), in metres. Everything is decided by cell
// position, so every client grows the same forest.
export interface NaturePiece {
  model: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

// Broad-leaved trees mostly, a pine now and then.
export const TREES = ["sn_tree_1", "sn_tree_2", "sn_tree_3", "sn_tree_4", "sn_tree_1", "sn_tree_3", "sn_pine_1", "sn_pine_3"];
const EDGE_PROPS = ["sn_rock", "sn_bush_flowers", "sn_fern"];
// Mostly grass, with clover, flowers, pebbles and the odd mushroom among it.
const GROUND_PLANTS = [
  "sn_grass", "sn_grass", "sn_grass", "sn_grass", "sn_grass", "sn_grass_wispy", "sn_clover", "sn_clover", "sn_flowers", "sn_flowers",
  "sn_pebbles", "sn_pebbles", "sn_mushroom",
];
export const NATURE_MODELS = [...new Set([...TREES, ...EDGE_PROPS, ...GROUND_PLANTS, "sn_stepping"])];

// What each model takes up on the ground at scale 1, as a radius in metres: the trunk for trees (the
// crowns hang high over the paths), the whole thing for rocks and bushes. Kept inside solid cells so
// nothing you can see stands where you can walk.
export const FOOTPRINT: Record<string, number> = {
  sn_tree_1: 0.4, sn_tree_2: 0.4, sn_tree_3: 0.4, sn_tree_4: 0.4, sn_pine_1: 0.45, sn_pine_3: 0.45,
  sn_rock: 1.5, sn_bush_flowers: 0.95, sn_fern: 1.2,
  sn_grass: 0.4, sn_grass_wispy: 0.6, sn_clover: 0.4, sn_flowers: 0.75, sn_pebbles: 0.25, sn_mushroom: 0.35, sn_stepping: 0.55,
};
// The ground cover's own size is for close-ups; on the meadow each is drawn this much smaller.
const PLANT_SCALE: Record<string, number> = {
  sn_grass: 0.35, sn_grass_wispy: 0.4, sn_clover: 0.45, sn_flowers: 0.35, sn_pebbles: 1.3, sn_mushroom: 0.7,
};
// How far apart the stones set into a path are, in metres.
const STONE_STEP = 2.4;
// Room kept between any two things on the ground, so no two meshes cut into each other.
export const GROUND_GAP = 0.05;
// How many nudged spots a piece tries before it is left out.
const TRIES = 6;
// Space left between a prop and the path.
const EDGE_GAP = 0.1;

// How far beyond the map the forest keeps going, in cells.
const BORDER = 3;
// Boulders along the forest's edge, smaller than the model's own size.
const ROCK_SCALE = [0.5, 0.8];

// Where the cheap firs stand that fill the forest behind its drawn edge: two in every cell deeper
// than the edge, on out past the map for FILLER_BORDER cells, a little shorter than the drawn trees
// so those stay in front. Heights in metres.
export interface Filler { x: number; z: number; height: number; shade: number }

const FILLER_BORDER = 5;

export function forestFillers(layout: LevelLayout): Filler[] {
  const t = layout.tileSize;
  const solid = (c: number, r: number) => c < 0 || r < 0 || c >= layout.cols || r >= layout.rows || layout.forest[r][c];
  const out: Filler[] = [];
  for (let r = -FILLER_BORDER; r < layout.rows + FILLER_BORDER; r++) {
    for (let c = -FILLER_BORDER; c < layout.cols + FILLER_BORDER; c++) {
      if (!solid(c, r)) continue;
      let edge = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (!solid(c + dc, r + dr)) edge = true;
      if (edge) continue;
      for (let i = 0; i < 2; i++) {
        // Kept a little inside the cell so none pokes out over the open ground.
        out.push({
          x: (c + 0.2 + cellNoise(c, r, 900 + i) * 0.6) * t,
          z: (r + 0.2 + cellNoise(c, r, 910 + i) * 0.6) * t,
          height: 6 + cellNoise(c, r, 920 + i) * 4,
          shade: cellNoise(c, r, 930 + i),
        });
      }
    }
  }
  return out;
}

// A stable pseudo-random number in [0, 1) for a cell and a purpose.
export function cellNoise(col: number, row: number, salt: number): number {
  let h = (col * 374761393 + row * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pick<T>(list: readonly T[], noise: number): T {
  return list[Math.min(list.length - 1, Math.floor(noise * list.length))];
}

function between(range: readonly number[], noise: number): number {
  return range[0] + (range[1] - range[0]) * noise;
}

// `paths` are the dirt paths (see paths.ts): nothing grows on them.
export function natureLayout(layout: LevelLayout, paths: readonly Point2[][] = []): NaturePiece[] {
  const t = layout.tileSize;
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < layout.cols && r < layout.rows;
  // Outside the map counts as solid: the forest goes on. A house's cells are neither forest nor
  // ground to plant on.
  const solid = (c: number, r: number) => !inside(c, r) || layout.forest[r][c];
  const built = (c: number, r: number) => inside(c, r) && layout.solid[r][c] && !layout.forest[r][c];
  const key = (c: number, r: number) => `${c},${r}`;
  const busy = new Set<string>();
  for (const p of [
    layout.playerSpawn, ...layout.portals, ...layout.platforms, ...(layout.bossSpawn ? [layout.bossSpawn] : []),
  ]) busy.add(key(Math.floor(p.x / t), Math.floor(p.z / t)));

  const out: NaturePiece[] = [];
  // What already stands on the ground: the platforms, then each piece placed, filed by cell so a
  // check only looks at the cells round it (nothing is wider than a cell, so the eight neighbours do).
  const taken = new Map<string, { x: number; z: number; r: number }[]>();
  const take = (o: { x: number; z: number; r: number }) => {
    const k = key(Math.floor(o.x / t), Math.floor(o.z / t));
    const list = taken.get(k);
    if (list) list.push(o);
    else taken.set(k, [o]);
  };
  for (const pl of layout.platforms) take({ x: pl.x, z: pl.z, r: Math.hypot(pl.w, pl.d) / 2 });
  const free = (x: number, z: number, radius: number) => {
    const c = Math.floor(x / t);
    const r = Math.floor(z / t);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        for (const o of taken.get(key(c + dc, r + dr)) ?? []) {
          if (Math.hypot(x - o.x, z - o.z) < o.r + radius + GROUND_GAP) return false;
        }
      }
    }
    return true;
  };
  // Tries the spot at(0), then nudged spots at(1), at(2)...; keeps the first that touches nothing.
  // A spot of null is no good and is passed over.
  const place = (model: string, scale: number, yaw: number, at: (attempt: number) => { x: number; z: number } | null) => {
    const radius = FOOTPRINT[model] * scale;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const spot = at(attempt);
      if (!spot) continue;
      const { x, z } = spot;
      if (!free(x, z, radius)) continue;
      take({ x, z, r: radius });
      out.push({ model, x, z, yaw, scale });
      return;
    }
  };
  const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  for (let r = -BORDER; r < layout.rows + BORDER; r++) {
    for (let c = -BORDER; c < layout.cols + BORDER; c++) {
      const cx = (c + 0.5) * t;
      const cz = (r + 0.5) * t;
      if (solid(c, r)) {
        const open = NEIGHBOURS.filter(([dc, dr]) => !solid(c + dc, r + dr));
        // Only the forest's edge, the trees you walk past, is drawn in full: one tree and a boulder or
        // bush facing the open ground. Deeper in, cheap firs stand instead (see forestFillers).
        if (open.length === 0) continue;
        const trees = 1;
        for (let i = 0; i < trees; i++) {
          const model = pick(TREES, cellNoise(c, r, 20 + i) ** 1.6);
          const scale = 0.85 + cellNoise(c, r, 60 + i) * 0.4;
          // Jittered, but the trunk stays inside the cell.
          const room = t / 2 - FOOTPRINT[model] * scale - EDGE_GAP;
          place(model, scale, cellNoise(c, r, 50 + i) * Math.PI * 2, (k) => ({
            x: cx + (cellNoise(c, r, 30 + i + k * 200) * 2 - 1) * room,
            z: cz + (cellNoise(c, r, 40 + i + k * 200) * 2 - 1) * room,
          }));
        }
        if (open.length > 0) {
          // A boulder or bush on the side that faces a path (straight sides first), its edge flush
          // with the cell's edge so it lines the path without stepping onto it.
          const [dc, dr] = [...open].sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])))[0];
          const model = pick(EDGE_PROPS, cellNoise(c, r, 70));
          const scale = model === "sn_rock" ? between(ROCK_SCALE, cellNoise(c, r, 72)) : 1 + cellNoise(c, r, 72) * 0.4;
          const reach = t / 2 - FOOTPRINT[model] * scale - EDGE_GAP;
          const len = Math.hypot(dc, dr);
          // Slid along the cell's edge when a trunk is in the way.
          place(model, scale, cellNoise(c, r, 71) * Math.PI * 2, (k) => {
            const slide = k === 0 ? 0 : (cellNoise(c, r, 73 + k) * 2 - 1) * reach;
            return { x: cx + (dc / len) * reach - (dr / len) * slide, z: cz + (dr / len) * reach + (dc / len) * slide };
          });
        }
        continue;
      }
      if (busy.has(key(c, r)) || built(c, r)) continue;
      const plants = 1 + Math.floor(cellNoise(c, r, 80) * 5);
      for (let i = 0; i < plants; i++) {
        const model = pick(GROUND_PLANTS, cellNoise(c, r, 81 + i));
        const scale = (PLANT_SCALE[model] ?? 1) * (0.8 + cellNoise(c, r, 120 + i) * 0.5);
        place(model, scale, cellNoise(c, r, 110 + i) * Math.PI * 2, (k) => {
          const x = cx + (cellNoise(c, r, 90 + i + k * 200) - 0.5) * t * 0.8;
          const z = cz + (cellNoise(c, r, 100 + i + k * 200) - 0.5) * t * 0.8;
          // Nothing grows on the path.
          return pathDistance(paths, x, z) < PATH_HALF_WIDTH + FOOTPRINT[model] * scale ? null : { x, z };
        });
      }
    }
  }
  // Flat stones set into the paths now and then, a step apart.
  paths.forEach((line, n) => {
    let travelled = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      for (; travelled < length; travelled += STONE_STEP) {
        const k = Math.round(travelled * 10) + i * 7919 + n * 104729;
        if (cellNoise(k, n, 140) < 0.35) continue;
        const f = travelled / length;
        // Off to either side of the middle a little, along the path's own crosswise direction.
        const side = (cellNoise(k, n, 141) - 0.5) * PATH_HALF_WIDTH;
        const x = a.x + (b.x - a.x) * f - ((b.z - a.z) / length) * side;
        const z = a.z + (b.z - a.z) * f + ((b.x - a.x) / length) * side;
        place("sn_stepping", 0.8 + cellNoise(k, n, 142) * 0.4, cellNoise(k, n, 143) * Math.PI * 2, () => ({ x, z }));
      }
      travelled -= length;
    }
  });
  return out;
}
