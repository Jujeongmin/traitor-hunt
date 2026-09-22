import type { LevelLayout } from "./levelLayout";

// The outdoor dressing for a grid level: forest and rocks where the map is solid, a few plants on
// the open ground. Polytope Studio's low-poly nature pack, in metres. Everything is decided by cell
// position, so every client grows the same forest.
export interface NaturePiece {
  model: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

export const TREES = ["pt_pine", "pt_pine_dead", "pt_fruit_tree", "pt_apple_tree"];
const EDGE_PROPS = ["pt_rock", "pt_shrub", "pt_shrub_dead"];
const GROUND_PLANTS = ["pt_grass", "pt_grass", "pt_grass", "pt_poppy", "pt_mushroom"];
export const NATURE_MODELS = [...new Set([...TREES, ...EDGE_PROPS, ...GROUND_PLANTS])];

// What each model takes up on the ground at scale 1, as a radius in metres: the trunk for trees (the
// crowns hang high over the paths), the whole thing for rocks and bushes. Kept inside solid cells so
// nothing you can see stands where you can walk.
export const FOOTPRINT: Record<string, number> = {
  pt_pine: 0.45, pt_pine_dead: 0.4, pt_fruit_tree: 0.4, pt_apple_tree: 0.4,
  pt_rock: 0.13, pt_shrub: 0.93, pt_shrub_dead: 0.69,
  pt_grass: 0.6, pt_poppy: 0.32, pt_mushroom: 0.18,
};
// Room kept between any two things on the ground, so no two meshes cut into each other.
export const GROUND_GAP = 0.05;
// How many nudged spots a piece tries before it is left out.
const TRIES = 6;
// Space left between a prop and the path.
const EDGE_GAP = 0.1;

// How far beyond the map the forest keeps going, in cells.
const BORDER = 3;
// The generic rock model is a pebble; boulders are that many times larger.
const ROCK_SCALE = [7, 11];

// Where the cheap firs stand that fill the forest behind its drawn edge: two in every cell deeper
// than the edge, on out past the map for FILLER_BORDER cells, a little shorter than the drawn trees
// so those stay in front. Heights in metres.
export interface Filler { x: number; z: number; height: number; shade: number }

const FILLER_BORDER = 5;

export function forestFillers(layout: LevelLayout): Filler[] {
  const t = layout.tileSize;
  const solid = (c: number, r: number) => c < 0 || r < 0 || c >= layout.cols || r >= layout.rows || layout.solid[r][c];
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

export function natureLayout(layout: LevelLayout): NaturePiece[] {
  const t = layout.tileSize;
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < layout.cols && r < layout.rows;
  // Outside the map counts as solid: the forest goes on.
  const solid = (c: number, r: number) => !inside(c, r) || layout.solid[r][c];
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
  const place = (model: string, scale: number, yaw: number, at: (attempt: number) => { x: number; z: number }) => {
    const radius = FOOTPRINT[model] * scale;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const { x, z } = at(attempt);
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
          const scale = model === "pt_rock" ? between(ROCK_SCALE, cellNoise(c, r, 72)) : 1 + cellNoise(c, r, 72) * 0.4;
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
      if (busy.has(key(c, r))) continue;
      const plants = Math.floor(cellNoise(c, r, 80) * 2.4);
      for (let i = 0; i < plants; i++) {
        place(pick(GROUND_PLANTS, cellNoise(c, r, 81 + i)), 0.8 + cellNoise(c, r, 120 + i) * 0.5, cellNoise(c, r, 110 + i) * Math.PI * 2, (k) => ({
          x: cx + (cellNoise(c, r, 90 + i + k * 200) - 0.5) * t * 0.8,
          z: cz + (cellNoise(c, r, 100 + i + k * 200) - 0.5) * t * 0.8,
        }));
      }
    }
  }
  return out;
}
