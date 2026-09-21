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
};
// Space left between a prop and the path.
const EDGE_GAP = 0.1;

// How far beyond the map the forest keeps going, in cells.
const BORDER = 3;
// The generic rock model is a pebble; boulders are that many times larger.
const ROCK_SCALE = [7, 11];

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
    layout.playerSpawn, ...layout.exits, ...layout.shards, ...layout.devices, ...layout.gates, ...layout.platforms,
    ...(layout.altar ? [layout.altar] : []), ...(layout.bossSpawn ? [layout.bossSpawn] : []),
  ]) busy.add(key(Math.floor(p.x / t), Math.floor(p.z / t)));

  const out: NaturePiece[] = [];
  const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];
  for (let r = -BORDER; r < layout.rows + BORDER; r++) {
    for (let c = -BORDER; c < layout.cols + BORDER; c++) {
      const cx = (c + 0.5) * t;
      const cz = (r + 0.5) * t;
      if (solid(c, r)) {
        const open = NEIGHBOURS.filter(([dc, dr]) => !solid(c + dc, r + dr));
        // Cells on a path's edge get a thicker wall of trees and a boulder or bush facing the path.
        const trees = open.length > 0 ? 2 : 1;
        for (let i = 0; i < trees; i++) {
          const model = pick(TREES, cellNoise(c, r, 20 + i) ** 1.6);
          const scale = 0.85 + cellNoise(c, r, 60 + i) * 0.4;
          // Jittered, but the trunk stays inside the cell.
          const room = t / 2 - FOOTPRINT[model] * scale - EDGE_GAP;
          out.push({
            model,
            x: cx + (cellNoise(c, r, 30 + i) * 2 - 1) * room,
            z: cz + (cellNoise(c, r, 40 + i) * 2 - 1) * room,
            yaw: cellNoise(c, r, 50 + i) * Math.PI * 2,
            scale,
          });
        }
        if (open.length > 0) {
          // A boulder or bush on the side that faces a path (straight sides first), its edge flush
          // with the cell's edge so it lines the path without stepping onto it.
          const [dc, dr] = [...open].sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])))[0];
          const model = pick(EDGE_PROPS, cellNoise(c, r, 70));
          const scale = model === "pt_rock" ? between(ROCK_SCALE, cellNoise(c, r, 72)) : 1 + cellNoise(c, r, 72) * 0.4;
          const reach = t / 2 - FOOTPRINT[model] * scale - EDGE_GAP;
          const len = Math.hypot(dc, dr);
          out.push({
            model,
            x: cx + (dc / len) * reach,
            z: cz + (dr / len) * reach,
            yaw: cellNoise(c, r, 71) * Math.PI * 2,
            scale,
          });
        }
        continue;
      }
      if (busy.has(key(c, r))) continue;
      const plants = Math.floor(cellNoise(c, r, 80) * 3);
      for (let i = 0; i < plants; i++) {
        out.push({
          model: pick(GROUND_PLANTS, cellNoise(c, r, 81 + i)),
          x: cx + (cellNoise(c, r, 90 + i) - 0.5) * t * 0.8,
          z: cz + (cellNoise(c, r, 100 + i) - 0.5) * t * 0.8,
          yaw: cellNoise(c, r, 110 + i) * Math.PI * 2,
          scale: 0.8 + cellNoise(c, r, 120 + i) * 0.5,
        });
      }
    }
  }
  return out;
}
