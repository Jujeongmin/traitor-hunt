import { describe, expect, it } from "vitest";
import {
  COSTUMES, PART_KEYS, PARTS, costumeById, costumeForSeat, encodeCostume, optionOf, withPart,
} from "../../src/game/render/costumes";

describe("costume parts", () => {
  it("encodes a costume as one digit per part and reads it back", () => {
    const id = encodeCostume({ gear: 1, clothColor: 3, skin: 2, weaponColor: 6 });
    expect(id).toBe("1326");
    expect(costumeById(id)!.parts).toEqual({ gear: 1, clothColor: 3, skin: 2, weaponColor: 6 });
  });

  it("turns away ids that are not a costume, and the ids from before the RPG heroes", () => {
    for (const bad of ["", "abc", "9999", "000", "00000", "000000000000", "hero", 42, null]) {
      expect(costumeById(bad)).toBeNull();
    }
  });

  it("steps one part to its next option and wraps round", () => {
    const start = COSTUMES[0];
    expect(withPart(start, "gear", 1).parts.gear).toBe(1);
    expect(withPart(start, "skin", -1).parts.skin).toBe(PARTS.skin.options.length - 1);
    expect(optionOf(withPart(start, "gear", 1), "gear").gear).toBe(false);
  });

  it("gives seats different clothes", () => {
    expect(costumeForSeat(0).id).not.toBe(costumeForSeat(1).id);
    expect(PART_KEYS).toHaveLength(4);
  });
});
