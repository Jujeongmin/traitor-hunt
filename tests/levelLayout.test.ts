import { describe, expect, it } from "vitest";
import { LEVEL_1, parseLevel, solidAt, spawnPoint } from "../src/game/rules/levelLayout";

const MAP = [
  "####",
  "#PZ#",
  "#.B#",
  "####",
];

describe("parseLevel", () => {
  const level = parseLevel(MAP, 2);

  it("records size, spawns and solidity", () => {
    expect(level.cols).toBe(4);
    expect(level.rows).toBe(4);
    expect(level.playerSpawn).toEqual({ x: 3, z: 3 });
    expect(level.zombieSpawns).toEqual([{ x: 5, z: 3 }]);
    expect(level.solid[0][0]).toBe(true);
    expect(level.solid[1][1]).toBe(false);
  });

  it("turns a prop cell into a platform to stand on", () => {
    expect(level.platforms.some((p) => p.x === 5 && p.z === 5)).toBe(true);
  });

  it("rejects ragged rows and unknown symbols", () => {
    expect(() => parseLevel(["##", "#"], 2)).toThrow(/row 1/);
    expect(() => parseLevel(["#?#"], 2)).toThrow(/unknown symbol "\?"/);
  });

  it("records exits as walkable floor cells", () => {
    const withExit = parseLevel(["####", "#PE#", "####"], 2);
    expect(withExit.exits).toEqual([{ x: 5, z: 3 }]);
    expect(withExit.solid[1][2]).toBe(false);
  });
});

describe("solidAt", () => {
  const level = parseLevel(MAP, 2);
  it("maps world coordinates to cells and treats outside as solid", () => {
    expect(solidAt(level, 3, 3)).toBe(false);
    expect(solidAt(level, 1.9, 3)).toBe(true);
    expect(solidAt(level, -0.1, 3)).toBe(true);
    expect(solidAt(level, 3, 100)).toBe(true);
  });
});

describe("LEVEL_1", () => {
  it("parses and has one player spawn and at least one zombie", () => {
    const level = parseLevel(LEVEL_1, 4);
    expect(level.zombieSpawns.length).toBeGreaterThan(0);
    expect(solidAt(level, level.playerSpawn.x, level.playerSpawn.z)).toBe(false);
  });

  it("has exactly one exit, on a walkable cell", () => {
    const level = parseLevel(LEVEL_1, 4);
    expect(level.exits).toEqual([{ x: 38, z: 26 }]);
    expect(solidAt(level, 38, 26)).toBe(false);
  });

  it("gives each player a different open spot in the spawn cell", () => {
    const level = parseLevel(LEVEL_1, 4);
    const spots = [0, 1, 2, 3].map((i) => spawnPoint(level, i));
    expect(new Set(spots.map((s) => `${s.x},${s.z}`)).size).toBe(4);
    for (const s of spots) {
      expect(Math.floor(s.x / 4)).toBe(1);
      expect(Math.floor(s.z / 4)).toBe(1);
    }
    expect(spawnPoint(level, 4)).toEqual(spots[0]);
  });
});
