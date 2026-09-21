import { describe, expect, it } from "vitest";
import { FOOTPRINT, NATURE_MODELS, TREES, natureLayout } from "../../src/game/rules/nature";
import { TILE_SIZE, solidAt } from "../../src/game/rules/levelLayout";
import { zoneLayout } from "../../src/game/world/zones";

const layout = zoneLayout("forest1");
const pieces = natureLayout(layout);
const cellOf = (v: number) => Math.floor(v / TILE_SIZE);

describe("natureLayout", () => {
  it("is the same every time, so every client sees the same forest", () => {
    expect(natureLayout(layout)).toEqual(pieces);
  });

  it("grows trees only where the map is solid, never on the paths", () => {
    const trees = pieces.filter((p) => TREES.includes(p.model));
    expect(trees.length).toBeGreaterThan(100);
    for (const t of trees) expect(solidAt(layout, t.x, t.z) || t.x < 0 || t.z < 0 || cellOf(t.x) >= layout.cols || cellOf(t.z) >= layout.rows).toBe(true);
  });

  it("rings the map with forest beyond its edge", () => {
    const outside = pieces.filter((p) => p.x < 0 || p.z < 0 || p.x > layout.cols * TILE_SIZE || p.z > layout.rows * TILE_SIZE);
    expect(outside.length).toBeGreaterThan(20);
  });

  it("scatters small plants on open ground but leaves the portals clear", () => {
    const small = pieces.filter((p) => !TREES.includes(p.model) && !solidAt(layout, p.x, p.z) && p.x > 0 && p.z > 0);
    expect(small.length).toBeGreaterThan(20);
    const busy = [layout.playerSpawn, ...layout.portals];
    for (const b of busy) {
      const near = small.filter((p) => cellOf(p.x) === cellOf(b.x) && cellOf(p.z) === cellOf(b.z));
      expect(near).toEqual([]);
    }
  });

  it("only uses models the game loads", () => {
    for (const p of pieces) expect(NATURE_MODELS).toContain(p.model);
  });
});

describe("nothing on the ground overlaps", () => {
  const foot = (p: { model: string; scale: number }) => FOOTPRINT[p.model] * p.scale;

  it("keeps every piece clear of every other piece", () => {
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i];
        const b = pieces[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(foot(a) + foot(b));
      }
    }
  });

  it("keeps every piece clear of the platforms", () => {
    for (const p of pieces) {
      for (const pl of layout.platforms) expect(Math.hypot(p.x - pl.x, p.z - pl.z)).toBeGreaterThanOrEqual(Math.hypot(pl.w, pl.d) / 2 + foot(p));
    }
  });
});
