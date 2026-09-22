import type { LevelLayout, Point2 } from "./levelLayout";
import { gridRoute } from "./pathing";

// The dirt paths worn into a zone's grass: from where you arrive to each portal and to any other
// places given (the village's doors), along the walkable route, with the grid's corners rounded off.

// Half a path's width, in metres.
export const PATH_HALF_WIDTH = 1.4;

// Cuts each corner of a line twice (Chaikin), so a route along the grid bends instead of stepping.
function rounded(points: Point2[]): Point2[] {
  let line = points;
  for (let pass = 0; pass < 2; pass++) {
    const next: Point2[] = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  return line;
}

export function groundPaths(layout: LevelLayout, destinations: readonly Point2[] = []): Point2[][] {
  const from = layout.playerSpawn;
  const out: Point2[][] = [];
  for (const to of [...layout.portals, ...destinations]) {
    const route = gridRoute(layout, from, to);
    if (route) out.push(rounded([from, ...route]));
  }
  return out;
}

// How far (x, z) is from the nearest path's middle line, in metres (Infinity with no paths).
export function pathDistance(paths: readonly Point2[][], x: number, z: number): number {
  let best = Infinity;
  for (const line of paths) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = dx * dx + dz * dz;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length));
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
    }
  }
  return best;
}
