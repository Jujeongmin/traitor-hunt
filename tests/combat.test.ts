import { describe, expect, it } from "vitest";
import { wallDistance, type Ray3 } from "../src/game/rules/combat";

const ahead: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 0, dz: -1 };
const open = () => false;

describe("wallDistance", () => {
  const wallAt = (d: number) => (_x: number, z: number) => z < -d;

  it("finds the wall along the ray", () => {
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeGreaterThanOrEqual(3);
    expect(wallDistance(ahead, wallAt(3), 60, 4)).toBeLessThan(3.1);
  });

  it("stops at the floor and the ceiling", () => {
    const down: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: -1, dz: 0 };
    expect(wallDistance(down, open, 60, 4)).toBeCloseTo(1.6, 1);
    const upward: Ray3 = { ox: 0, oy: 1.6, oz: 0, dx: 0, dy: 1, dz: 0 };
    expect(wallDistance(upward, open, 60, 4)).toBeCloseTo(2.4, 1);
  });

  it("runs the full range in the open", () => {
    expect(wallDistance(ahead, open, 10, 4)).toBe(10);
  });
});
