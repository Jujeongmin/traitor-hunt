import { describe, expect, it } from "vitest";
import { crowdBlocks } from "../../src/game/rules/crowd";

describe("crowdBlocks", () => {
  const other = [{ x: 0, z: 0, r: 1 }];

  it("stops a step into another body", () => {
    expect(crowdBlocks(other, { x: 2, z: 0 }, 0.9, 0)).toBe(true);
    expect(crowdBlocks(other, { x: 2, z: 0 }, 1.2, 0)).toBe(false);
  });

  it("lets two bodies that already overlap move apart, but not closer", () => {
    expect(crowdBlocks(other, { x: 0.5, z: 0 }, 0.6, 0)).toBe(false);
    expect(crowdBlocks(other, { x: 0.5, z: 0 }, 0.4, 0)).toBe(true);
  });
});
