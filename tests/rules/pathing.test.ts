import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import { gridRoute } from "../../src/game/rules/pathing";
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
