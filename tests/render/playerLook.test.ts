import { describe, expect, it } from "vitest";
import { COSTUMES, PARTS, costumeForSeat } from "../../src/game/render/costumes";

describe("costume presets", () => {
  it("wraps the seat number around the clothes colours", () => {
    const n = PARTS.clothColor.options.length;
    expect(costumeForSeat(n)).toEqual(costumeForSeat(0));
    expect(costumeForSeat(-1)).toEqual(costumeForSeat(n - 1));
  });

  it("offers a few ready-made looks", () => {
    expect(COSTUMES.map((c) => c.name)).toEqual(["기본", "가벼운 차림", "그림자"]);
  });
});
