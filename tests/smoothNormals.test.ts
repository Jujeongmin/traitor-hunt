import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { smoothNormals } from "../scripts/lib/smoothNormals.mjs";

describe("smoothNormals", () => {
  it("averages normals that meet at a shallow fold", () => {
    // Two vertices at one point, from faces 40° apart.
    const a = [Math.sin(-0.35), Math.cos(-0.35), 0];
    const b = [Math.sin(0.35), Math.cos(0.35), 0];
    const out = smoothNormals(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([...a, ...b]));
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(1);
    expect(out[3]).toBeCloseTo(0);
  });

  it("keeps a sharp edge sharp", () => {
    // Faces meeting at a right angle, like the edge of a box.
    const out = smoothNormals(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0, 1, 0, 0]));
    expect([...out]).toEqual([0, 1, 0, 1, 0, 0]);
  });

  it("leaves vertices at different points alone", () => {
    const out = smoothNormals(new Float32Array([0, 0, 0, 1, 0, 0]), new Float32Array([0, 1, 0, 0, 0, 1]));
    expect([...out]).toEqual([0, 1, 0, 0, 0, 1]);
  });
});
