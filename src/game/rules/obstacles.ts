import { SEAL_RADIUS } from "../match/constants";
import type { LevelLayout, Point2 } from "./levelLayout";

// Standing stones on open ground that nobody walks through: the two rune stones, the altar stone
// and the ring around it. The renderer draws them from these same positions.
export interface Obstacle extends Point2 {
  r: number;
}

// Footprint radii in metres, matching the drawn stones (the menhir model is 1.36 m across).
export const DEVICE_STONE_R = 0.55;
export const ALTAR_STONE_R = 0.8;
export const RING_STONE_R = 0.3;
const RING_STONES = 10;

function openAt(layout: LevelLayout, p: Point2): boolean {
  const c = Math.floor(p.x / layout.tileSize);
  const r = Math.floor(p.z / layout.tileSize);
  return c >= 0 && r >= 0 && c < layout.cols && r < layout.rows && !layout.solid[r][c];
}

// The small stones that ring the altar and mark the guarded area; those that would stand in the
// forest are left out.
export function altarRing(layout: LevelLayout): Point2[] {
  const altar = layout.altar;
  if (!altar) return [];
  const ring: Point2[] = [];
  for (let i = 0; i < RING_STONES; i++) {
    const a = (i / RING_STONES) * Math.PI * 2;
    const at = { x: altar.x + Math.cos(a) * SEAL_RADIUS, z: altar.z + Math.sin(a) * SEAL_RADIUS };
    if (openAt(layout, at)) ring.push(at);
  }
  return ring;
}

export function obstaclesFor(layout: LevelLayout): Obstacle[] {
  const out: Obstacle[] = layout.devices.map((d) => ({ x: d.x, z: d.z, r: DEVICE_STONE_R }));
  if (layout.altar) out.push({ x: layout.altar.x, z: layout.altar.z, r: ALTAR_STONE_R });
  for (const s of altarRing(layout)) out.push({ x: s.x, z: s.z, r: RING_STONE_R });
  return out;
}

export function obstacleBlocks(obstacles: readonly Obstacle[], x: number, z: number): boolean {
  return obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r);
}
