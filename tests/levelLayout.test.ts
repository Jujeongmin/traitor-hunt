import { describe, expect, it } from "vitest";
import { parseLevel, solidAt } from "../src/game/rules/levelLayout";

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

  it("records portals as walkable floor cells", () => {
    const withPortal = parseLevel(["####", "#PO#", "####"], 2);
    expect(withPortal.portals).toEqual([{ x: 5, z: 3 }]);
    expect(withPortal.solid[1][2]).toBe(false);
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
