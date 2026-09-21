import { describe, expect, it } from "vitest";
import { RUINS, TILE_SIZE, parseLevel, solidWith } from "../../src/game/rules/levelLayout";

const level = parseLevel(RUINS, TILE_SIZE);

describe("RUINS", () => {
  it("has every objective spot", () => {
    expect([level.cols, level.rows]).toEqual([25, 13]);
    expect(level.playerSpawn).toEqual({ x: 6, z: 6 });
    expect(level.zombieSpawns[0]).toEqual({ x: 34, z: 14 });
    expect(level.shards).toEqual([{ x: 38, z: 6 }, { x: 6, z: 30 }]);
    expect(level.devices).toEqual([{ x: 50, z: 10 }, { x: 90, z: 10 }]);
    expect(level.altar).toEqual({ x: 82, z: 34 });
    expect(level.waveSpawns).toHaveLength(4);
    expect(level.bossSpawn).toEqual({ x: 54, z: 38 });
    expect(level.gates).toEqual([{ n: 1, x: 42, z: 18 }, { n: 2, x: 66, z: 22 }, { n: 3, x: 66, z: 42 }]);
    expect(level.exits).toEqual([{ x: 54, z: 46 }]);
  });

  it("treats closed gates as walls and open ones as floor", () => {
    expect(solidWith(level, [])(42, 18)).toBe(true);
    expect(solidWith(level, [1])(42, 18)).toBe(false);
    expect(solidWith(level, [1])(40, 18)).toBe(false);
    expect(solidWith(level, [1, 2, 3])(1, 1)).toBe(true);
  });
});
