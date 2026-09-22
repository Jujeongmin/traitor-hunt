import { solidAt, type LevelLayout, type Point2 } from "./levelLayout";

// Whether a body of `radius` can walk the straight line between two spots without touching the
// forest (sampled every half metre, at the body's edge on either side).
export function lineClear(layout: LevelLayout, from: Point2, to: Point2, radius = 0.4): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return true;
  const sx = (-dz / length) * radius;
  const sz = (dx / length) * radius;
  for (let d = 0; d <= length; d += 0.5) {
    const x = from.x + (dx * d) / length;
    const z = from.z + (dz * d) / length;
    if (solidAt(layout, x, z) || solidAt(layout, x + sx, z + sz) || solidAt(layout, x - sx, z - sz)) return false;
  }
  return true;
}

// A walkable route across a zone's grid, for auto-battle heading to a monster it cannot see yet:
// the shortest chain of open cells from one spot to another, as the centres of the cells where the
// route turns (the straight runs between are walked as they are).
export function gridRoute(layout: LevelLayout, from: Point2, to: Point2): Point2[] | null {
  const t = layout.tileSize;
  const cell = (p: Point2) => [Math.floor(p.x / t), Math.floor(p.z / t)] as const;
  const [sc, sr] = cell(from);
  const [ec, er] = cell(to);
  const open = (c: number, r: number) => c >= 0 && r >= 0 && c < layout.cols && r < layout.rows && !layout.solid[r][c];
  if (!open(sc, sr) || !open(ec, er)) return null;
  const key = (c: number, r: number) => r * layout.cols + c;
  const came = new Map<number, number>([[key(sc, sr), -1]]);
  const queue: [number, number][] = [[sc, sr]];
  let found = false;
  while (queue.length > 0 && !found) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (!open(nc, nr) || came.has(key(nc, nr))) continue;
      came.set(key(nc, nr), key(c, r));
      if (nc === ec && nr === er) {
        found = true;
        break;
      }
      queue.push([nc, nr]);
    }
  }
  if (!found) return null;
  const cells: [number, number][] = [];
  for (let k: number = key(ec, er); k !== -1; k = came.get(k)!) cells.push([k % layout.cols, Math.floor(k / layout.cols)]);
  cells.reverse();
  // Keep only the corners.
  const out: Point2[] = [];
  for (let i = 1; i < cells.length; i++) {
    const [pc, pr] = cells[i - 1];
    const [c, r] = cells[i];
    const [nc, nr] = cells[i + 1] ?? [c + (c - pc), r + (r - pr)];
    if (nc - c !== c - pc || nr - r !== r - pr) out.push({ x: (c + 0.5) * t, z: (r + 0.5) * t });
  }
  out.push({ x: to.x, z: to.z });
  return out;
}
