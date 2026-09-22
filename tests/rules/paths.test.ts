import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import { FOOTPRINT, natureLayout } from "../../src/game/rules/nature";
import { PATH_HALF_WIDTH, groundPaths, pathDistance } from "../../src/game/rules/paths";
import { zoneLayout } from "../../src/game/world/zones";

describe("groundPaths", () => {
  it("runs a path from where you arrive to every portal", () => {
    const layout = zoneLayout("forest1");
    const paths = groundPaths(layout);
    expect(paths).toHaveLength(layout.portals.length);
    for (const [i, portal] of layout.portals.entries()) {
      const line = paths[i];
      expect(line[0]).toEqual(layout.playerSpawn);
      expect(line[line.length - 1]).toEqual(portal);
    }
    expect(pathDistance(paths, layout.playerSpawn.x, layout.playerSpawn.z)).toBe(0);
  });

  it("keeps plants off the paths; only the stones set into them stand there", () => {
    const layout = zoneLayout("forest1");
    const paths = groundPaths(layout);
    const pieces = natureLayout(layout, paths);
    const onPath = pieces.filter((p) => pathDistance(paths, p.x, p.z) < PATH_HALF_WIDTH + FOOTPRINT[p.model] * p.scale - 0.01);
    expect(onPath.length).toBeGreaterThan(0);
    // Besides the stones, only the forest's edge (standing on solid cells) may reach over a path.
    for (const p of onPath) {
      if (p.model !== "sn_stepping") expect(solidAt(layout, p.x, p.z)).toBe(true);
    }
    expect(onPath.some((p) => p.model === "sn_stepping")).toBe(true);
  });
});
