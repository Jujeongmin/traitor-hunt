import { describe, expect, it } from "vitest";
import { costumeForSeat, costumeById, wearing } from "../../src/game/render/costumes";

describe("costumeById", () => {
  it("finds a costume by its id and falls back to the first one", () => {
    expect(costumeById("1413")?.id).toBe("1413");
    expect(costumeById("nonesuch")).toBeNull();
  });
});

describe("wearing", () => {
  it("is what the player picked", () => {
    expect(wearing({ a: "1413" }, "a", 0).id).toBe("1413");
  });

  it("falls back to the seat's costume for bots, unknown ids and missing lists", () => {
    expect(wearing({}, "bot-1", 2)).toEqual(costumeForSeat(2));
    expect(wearing({ a: "nonesuch" }, "a", 1)).toEqual(costumeForSeat(1));
    expect(wearing(undefined, "a", 3)).toEqual(costumeForSeat(3));
  });

  it("gives everyone a costume even when the seat is unknown", () => {
    expect(costumeById(wearing({}, "a", -1).id)).not.toBeNull();
  });
});
