import { cellNoise } from "../rules/nature";

// Draws a zone's map (the same symbols as a hand-written one, see levelLayout.ts) from a few numbers,
// so the fields can be wide without anyone typing out a 50-column grid. The same numbers always give
// the same map, on every client and on the server.

export type Side = "W" | "E" | "N" | "S";

export interface FieldSpec {
  cols: number;
  rows: number;
  // Picks this map's groves and ragged edges; change it for a different map of the same size.
  seed: number;
  // Where you appear when nothing else says, as [col, row].
  spawn: [number, number];
  // One portal per entry, in the order the zone lists where they lead: which edge, and how far
  // along it (a column for N and S, a row for W and E).
  portals: { side: Side; at: number }[];
  // How many monster spots (Z), kept apart from each other and clear of the spawn and the portals.
  monsters: number;
  // The boss's spot (K), if any.
  boss?: [number, number];
  // Clumps of trees scattered over the open ground, and how deep the forest edge may bite in.
  groves: number;
  edge: number;
  // Things to stand on (see platforms.ts), placed on open ground in turn.
  props: string;
}

// Open ground this many cells round the spawn, the portals and the boss stays clear of trees.
const CLEAR = 2;
// Monsters stand at least this many cells from the spawn and portals, and from each other.
const MONSTER_AWAY = 7;
const MONSTER_APART = 4;

export function fieldMap(spec: FieldSpec): string[] {
  const { cols, rows, seed } = spec;
  const n = (c: number, r: number, salt: number) => cellNoise(c + seed * 97, r + seed * 131, salt);
  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => "."));
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const set = (c: number, r: number, ch: string) => {
    if (inside(c, r)) grid[r][c] = ch;
  };

  // A ragged forest edge: each border cell's wall runs 1 to edge + 1 cells deep, smoothed along the edge.
  const depth = (i: number, side: number) => 1 + Math.floor(((n(i, side, 1) + n(i + 1, side, 1) + n(i - 1, side, 1)) / 3) * (spec.edge + 1));
  for (let c = 0; c < cols; c++) {
    for (let d = 0; d < depth(c, 0); d++) set(c, d, "#");
    for (let d = 0; d < depth(c, 1); d++) set(c, rows - 1 - d, "#");
  }
  for (let r = 0; r < rows; r++) {
    for (let d = 0; d < depth(r, 2); d++) set(d, r, "#");
    for (let d = 0; d < depth(r, 3); d++) set(cols - 1 - d, r, "#");
  }

  // Groves: rough discs of forest standing out in the open.
  for (let g = 0; g < spec.groves; g++) {
    const gc = 3 + Math.floor(n(g, 0, 10) * (cols - 6));
    const gr = 3 + Math.floor(n(g, 0, 11) * (rows - 6));
    const radius = 1 + n(g, 0, 12) * 2.2;
    for (let r = Math.floor(gr - radius) - 1; r <= gr + radius + 1; r++) {
      for (let c = Math.floor(gc - radius) - 1; c <= gc + radius + 1; c++) {
        const d = Math.hypot(c - gc, r - gr);
        if (d <= radius + (n(c, r, 13) - 0.5) * 1.2) set(c, r, "#");
      }
    }
  }

  // The portals, on their edges, with a clear way in from each.
  const portals = spec.portals.map(({ side, at }) => {
    if (side === "W") return [0, at] as const;
    if (side === "E") return [cols - 1, at] as const;
    if (side === "N") return [at, 0] as const;
    return [at, rows - 1] as const;
  });
  const [sc, sr] = spec.spawn;
  const clearAround = (c: number, r: number, radius: number) => {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc > 0 && rr > 0 && cc < cols - 1 && rr < rows - 1) grid[rr][cc] = ".";
      }
    }
  };
  // A two-cell-wide road between two cells, across then down.
  const road = (c0: number, r0: number, c1: number, r1: number) => {
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) clearAround(c, r0, 1);
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) clearAround(c1, r, 1);
  };
  clearAround(sc, sr, CLEAR);
  for (const [pc, pr] of portals) {
    const ic = Math.min(Math.max(pc, 1), cols - 2);
    const ir = Math.min(Math.max(pr, 1), rows - 2);
    // The road runs in from the portal until it is clear of the edge forest.
    const deep = spec.edge + 2;
    const ec = pc === 0 ? deep : pc === cols - 1 ? cols - 1 - deep : ic;
    const er = pr === 0 ? deep : pr === rows - 1 ? rows - 1 - deep : ir;
    road(ic, ir, ec, er);
    road(ec, er, sc, sr);
  }
  if (spec.boss) {
    clearAround(spec.boss[0], spec.boss[1], CLEAR + 1);
    road(spec.boss[0], spec.boss[1], sc, sr);
  }

  // Open ground walled off from the spawn by groves becomes forest too: nobody can reach it.
  const reach = new Set<string>([`${sc},${sr}`]);
  const queue: [number, number][] = [[sc, sr]];
  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (inside(nc, nr) && grid[nr][nc] !== "#" && !reach.has(`${nc},${nr}`)) {
        reach.add(`${nc},${nr}`);
        queue.push([nc, nr]);
      }
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!reach.has(`${c},${r}`)) grid[r][c] = "#";

  for (const [pc, pr] of portals) grid[pr][pc] = "O";
  grid[sr][sc] = "P";
  if (spec.boss) grid[spec.boss[1]][spec.boss[0]] = "K";

  // Open cells, in a stable shuffled order, for monsters and props.
  const open: [number, number][] = [];
  for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) if (grid[r][c] === ".") open.push([c, r]);
  open.sort((a, b) => n(a[0], a[1], 20) - n(b[0], b[1], 20));
  const keepOut = [[sc, sr], ...portals.map(([c, r]) => [c, r]), ...(spec.boss ? [spec.boss] : [])];
  const monsters: [number, number][] = [];
  for (const [c, r] of open) {
    if (monsters.length >= spec.monsters) break;
    if (keepOut.some(([kc, kr]) => Math.hypot(c - kc, r - kr) < MONSTER_AWAY)) continue;
    if (monsters.some(([mc, mr]) => Math.hypot(c - mc, r - mr) < MONSTER_APART)) continue;
    // Not hard against the forest, so it has room to move.
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => grid[r + dr][c + dc] === "#")) continue;
    monsters.push([c, r]);
  }
  for (const [c, r] of monsters) grid[r][c] = "Z";

  let placed = 0;
  for (const [c, r] of [...open].reverse()) {
    if (placed >= spec.props.length) break;
    if (grid[r][c] !== ".") continue;
    if (keepOut.some(([kc, kr]) => Math.hypot(c - kc, r - kr) < 3)) continue;
    // Props stand clear of each other and of monsters.
    const near = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].some(([dc, dr]) => grid[r + dr][c + dc] !== ".");
    if (near) continue;
    grid[r][c] = spec.props[placed++];
  }

  return grid.map((row) => row.join(""));
}
