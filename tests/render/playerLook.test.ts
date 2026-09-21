import { describe, expect, it } from "vitest";
import { COSTUMES, costumeForSeat } from "../../src/game/render/costumes";

describe("costume presets", () => {
  it("wraps the seat number around the presets", () => {
    expect(costumeForSeat(COSTUMES.length)).toBe(costumeForSeat(0));
    expect(costumeForSeat(-1)).toBe(COSTUMES[COSTUMES.length - 1]);
  });

  it("names the pack's two heroes", () => {
    expect(COSTUMES.map((c) => c.name)).toEqual(["용사", "여용사"]);
  });
});
