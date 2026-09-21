import { describe, expect, it } from "vitest";
import { COSTUMES, COSTUME_MODELS, costumeForSeat } from "../../src/game/render/costumes";

describe("costumes", () => {
  it("wraps the seat number around the list", () => {
    expect(costumeForSeat(COSTUMES.length)).toBe(costumeForSeat(0));
    expect(costumeForSeat(-1)).toBe(COSTUMES[COSTUMES.length - 1]);
  });

  it("draws each costume with a hero model, each model loaded once", () => {
    expect(COSTUMES.map((c) => c.model)).toEqual(["hero_male", "hero_female"]);
    expect(COSTUME_MODELS).toEqual(["hero_male", "hero_female"]);
  });
});
