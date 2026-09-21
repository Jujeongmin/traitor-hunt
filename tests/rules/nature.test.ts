import { describe, expect, it } from "vitest";
import { NATURE_MODELS, TREES, natureLayout } from "../../src/game/rules/nature";
import { RUINS, TILE_SIZE, parseLevel, solidAt } from "../../src/game/rules/levelLayout";

const layout = parseLevel(RUINS, TILE_SIZE);
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

  it("scatters small plants on open ground but leaves the objectives clear", () => {
    const small = pieces.filter((p) => !TREES.includes(p.model) && !solidAt(layout, p.x, p.z) && p.x > 0 && p.z > 0);
    expect(small.length).toBeGreaterThan(20);
    const busy = [...layout.shards, ...layout.devices, ...layout.exits, ...layout.gates, ...(layout.altar ? [layout.altar] : [])];
    for (const b of busy) {
      const near = small.filter((p) => cellOf(p.x) === cellOf(b.x) && cellOf(p.z) === cellOf(b.z));
      expect(near).toEqual([]);
    }
  });

  it("only uses models the game loads", () => {
    for (const p of pieces) expect(NATURE_MODELS).toContain(p.model);
  });
});
