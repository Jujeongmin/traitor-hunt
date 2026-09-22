import { describe, expect, it } from "vitest";
import { hotbarFor, setHotbarSlot } from "../../src/ui/settings";

describe("the skill bar", () => {
  it("starts with the class's first skill in the first slot", () => {
    expect(hotbarFor("ranger")).toEqual([0, null, null]);
  });

  it("takes a skill into a slot, moving it out of any other, and empties slots", () => {
    setHotbarSlot("wizard", 2, 1);
    expect(hotbarFor("wizard")).toEqual([0, null, 1]);
    setHotbarSlot("wizard", 1, 1);
    expect(hotbarFor("wizard")).toEqual([0, 1, null]);
    setHotbarSlot("wizard", 0, null);
    expect(hotbarFor("wizard")).toEqual([null, 1, null]);
    // Other classes keep their own bars.
    expect(hotbarFor("ranger")).toEqual([0, null, null]);
  });
});
