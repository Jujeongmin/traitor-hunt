import { describe, expect, it } from "vitest";
import { COSTUMES, costumeForSeat, costumeById, wearing } from "../../src/game/render/costumes";

describe("costumeById", () => {
  it("finds a costume by its id and falls back to the first one", () => {
    expect(costumeById("raider")?.id).toBe("raider");
    expect(costumeById("nonesuch")).toBeNull();
  });
});

describe("wearing", () => {
  it("is what the player picked", () => {
    expect(wearing({ a: "raider" }, "a", 0).id).toBe("raider");
  });

  it("falls back to the seat's costume for bots, unknown ids and missing lists", () => {
    expect(wearing({}, "bot-1", 2)).toEqual(costumeForSeat(2));
    expect(wearing({ a: "nonesuch" }, "a", 1)).toEqual(costumeForSeat(1));
    expect(wearing(undefined, "a", 3)).toEqual(costumeForSeat(3));
  });

  it("gives everyone a costume even when the seat is unknown", () => {
    expect(COSTUMES).toContainEqual(wearing({}, "a", -1));
  });
});
