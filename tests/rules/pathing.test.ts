import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import { gridRoute, lineClear } from "../../src/game/rules/pathing";
import { zoneLayout } from "../../src/game/world/zones";

describe("gridRoute", () => {
  it("finds a way over open ground from the spawn to every monster, ending at it", () => {
    const layout = zoneLayout("forest1");
    for (const spot of layout.zombieSpawns) {
      const route = gridRoute(layout, layout.playerSpawn, spot);
      expect(route).not.toBeNull();
      for (const p of route!) expect(solidAt(layout, p.x, p.z)).toBe(false);
      expect(route!.at(-1)).toEqual(spot);
    }
  });

  it("answers null from or to the forest", () => {
    const layout = zoneLayout("forest1");
    expect(gridRoute(layout, { x: 1, z: 1 }, layout.playerSpawn)).toBeNull();
  });
});

describe("lineClear", () => {
  it("sees the forest standing between two spots, and open ground where there is none", () => {
    const layout = zoneLayout("forest1");
    const t = layout.tileSize;
    // Find an open cell with forest two cells east and open ground beyond it.
    let blocked: { from: { x: number; z: number }; to: { x: number; z: number } } | null = null;
    for (let r = 1; r < layout.rows - 1 && !blocked; r++) {
      for (let c = 1; c < layout.cols - 3 && !blocked; c++) {
        if (!layout.solid[r][c] && layout.solid[r][c + 1] && !layout.solid[r][c + 2]) {
          blocked = { from: { x: (c + 0.5) * t, z: (r + 0.5) * t }, to: { x: (c + 2.5) * t, z: (r + 0.5) * t } };
        }
      }
    }
    expect(blocked).not.toBeNull();
    expect(lineClear(layout, blocked!.from, blocked!.to)).toBe(false);
    const spawn = layout.playerSpawn;
    expect(lineClear(layout, spawn, { x: spawn.x + 1, z: spawn.z })).toBe(true);
  });
});
