import { describe, expect, it } from "vitest";
import { SEAL_RADIUS } from "../../src/game/match/constants";
import { RUINS, TILE_SIZE, parseLevel, solidAt, solidWith } from "../../src/game/rules/levelLayout";
import { FOOTPRINT, natureLayout } from "../../src/game/rules/nature";
import { altarRing, obstaclesFor } from "../../src/game/rules/obstacles";

const layout = parseLevel(RUINS, TILE_SIZE);

describe("obstaclesFor", () => {
  it("puts a stone on each rune stone, the altar and every stone of its ring", () => {
    const obstacles = obstaclesFor(layout);
    for (const d of layout.devices) expect(obstacles.some((o) => o.x === d.x && o.z === d.z)).toBe(true);
    expect(obstacles.some((o) => o.x === layout.altar!.x && o.z === layout.altar!.z)).toBe(true);
    const ring = altarRing(layout);
    expect(ring.length).toBeGreaterThan(5);
    for (const s of ring) {
      expect(Math.hypot(s.x - layout.altar!.x, s.z - layout.altar!.z)).toBeCloseTo(SEAL_RADIUS);
      expect(obstacles).toContainEqual(expect.objectContaining({ x: s.x, z: s.z }));
    }
  });

  it("leaves out ring stones that would stand in the forest", () => {
    for (const s of altarRing(layout)) expect(solidAt(layout, s.x, s.z)).toBe(false);
  });
});

describe("solidWith and obstacles", () => {
  it("blocks walking into a stone, but a path search can still aim at its cell", () => {
    const device = layout.devices[0];
    expect(solidWith(layout, [])(device.x, device.z)).toBe(true);
    expect(solidWith(layout, [], 0, false)(device.x, device.z)).toBe(false);
    expect(solidWith(layout, [])(device.x + 1.5, device.z)).toBe(false);
  });
});

describe("nature stays in the forest", () => {
  it("keeps every tree, rock and bush inside its solid cell, off the paths", () => {
    const t = TILE_SIZE;
    for (const p of natureLayout(layout)) {
      if (!solidAt(layout, p.x, p.z)) continue;
      const r = (FOOTPRINT[p.model] ?? 0) * p.scale;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        const x = p.x + dx;
        const z = p.z + dz;
        const onMap = x > 0 && z > 0 && x < layout.cols * t && z < layout.rows * t;
        if (onMap) expect(solidAt(layout, x, z)).toBe(true);
      }
    }
  });
});
