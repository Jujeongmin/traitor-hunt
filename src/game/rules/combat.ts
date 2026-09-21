import type { SolidTest } from "./movement";

// Line-of-sight checks against the map: the camera pulling in before a wall, and bots checking
// they can see a monster.
const MARCH_STEP = 0.05;

export interface Ray3 { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }

// How far a ray travels before it meets a wall, the floor or the ceiling.
export function wallDistance(ray: Ray3, isSolid: SolidTest, maxRange: number, ceilingY: number): number {
  const steps = Math.ceil(maxRange / MARCH_STEP);
  for (let i = 1; i <= steps; i++) {
    const t = i * MARCH_STEP;
    const y = ray.oy + ray.dy * t;
    if (y <= 0 || y >= ceilingY || isSolid(ray.ox + ray.dx * t, ray.oz + ray.dz * t)) return t;
  }
  return maxRange;
}
