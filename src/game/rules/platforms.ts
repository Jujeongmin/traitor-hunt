import { MAX_JUMP_RISE, PLAYER_RADIUS } from "./movement";

// Things you can stand on: log piles, a boulder beside them and a stump. Each is a box on
// the floor: x/z its centre, w along x, d along z, h its top. Players jump onto them; monsters and bots
// walk around them, since they never leave the floor.
export interface Platform {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  // The model drawn stretched to the box.
  model: string;
}

// A jump rises about 0.63 m, so a log pile is reached from the ground and the boulder only from the
// logs next to it.
export const LOW_H = 0.5;
export const HIGH_H = 1.0;
// A top this close to your feet or below them does not block you.
export const STEP_UP = 0.05;

// Measured from the models at kit scale (2026-09-18).
const BARREL = { w: 1.1, d: 1.1, h: 1.3 };

// Platforms for one map cell, by its symbol, centred on the cell centre.
export function platformsFor(symbol: string, x: number, z: number): Platform[] {
  switch (symbol) {
    case "c":
      return [{ x, z, w: 1.4, d: 1.4, h: LOW_H, model: "pt_logs" }];
    case "H":
      return [
        { x: x - 1.0, z, w: 1.2, d: 1.2, h: LOW_H, model: "pt_logs" },
        { x: x + 0.7, z, w: 1.8, d: 1.8, h: HIGH_H, model: "pt_rock" },
      ];
    case "B":
      return [{ x, z, ...BARREL, model: "pt_tree_stump" }];
    default:
      return [];
  }
}

function overlaps(p: Platform, x: number, z: number, radius: number): boolean {
  return Math.abs(x - p.x) < p.w / 2 + radius && Math.abs(z - p.z) < p.d / 2 + radius;
}

// The height your feet rest at: the highest platform under any part of the body, else the floor.
export function groundAt(platforms: readonly Platform[], x: number, z: number, radius: number): number {
  let ground = 0;
  for (const p of platforms) if (p.h > ground && overlaps(p, x, z, radius)) ground = p.h;
  return ground;
}

// The highest a body at (x, z) can honestly be: whatever it stands on, plus one jump. The server
// cuts reported heights down to this, so nobody claims to be out of a zombie's reach in the open.
export function maxFeetY(platforms: readonly Platform[], x: number, z: number): number {
  return groundAt(platforms, x, z, PLAYER_RADIUS) + MAX_JUMP_RISE;
}

// Whether a point is inside a platform too tall to walk onto with feet at feetY.
export function platformBlocks(platforms: readonly Platform[], x: number, z: number, feetY: number): boolean {
  return platforms.some((p) => p.h > feetY + STEP_UP && overlaps(p, x, z, 0));
}
