import { describe, expect, it } from "vitest";
import {
  COSTUMES, COSTUME_MODELS, PART_KEYS, PARTS, costumeById, costumeForSeat, encodeCostume, shownMeshes, withPart,
} from "../../src/game/render/costumes";

describe("costume parts", () => {
  it("draws every costume with the one modular hero", () => {
    expect(COSTUME_MODELS).toEqual(["hero"]);
  });

  it("encodes a costume as one digit per part and reads it back", () => {
    const id = encodeCostume({ head: 1, hair: 0, eyes: 1, mouth: 0, body: 1, cloak: 2, weapon: 1, shield: 0 });
    expect(id).toHaveLength(PART_KEYS.length);
    const costume = costumeById(id)!;
    expect(costume.parts).toEqual({ head: 1, hair: 0, eyes: 1, mouth: 0, body: 1, cloak: 2, weapon: 1, shield: 0 });
    expect(costume.id).toBe(id);
  });

  it("turns away ids that are not a costume", () => {
    for (const bad of ["", "abc", "99999999", "0000000", "000000000", 42, null]) expect(costumeById(bad)).toBeNull();
  });

  it("still reads the two named costumes as presets", () => {
    expect(costumeById("hero")?.id).toBe(COSTUMES[0].id);
    expect(costumeById("heroine")?.id).toBe(COSTUMES[1].id);
  });

  it("shows exactly one mesh per part, and none for a missing cloak", () => {
    const costume = costumeById(encodeCostume({ head: 0, hair: 1, eyes: 0, mouth: 1, body: 0, cloak: 2, weapon: 0, shield: 1 }))!;
    const shown = shownMeshes(costume);
    expect(shown.has(PARTS.hair.options[1].mesh!)).toBe(true);
    expect(shown.has(PARTS.hair.options[0].mesh!)).toBe(false);
    expect([...shown].filter((m) => m.startsWith("Cloak"))).toEqual([]);
    expect(shown.size).toBe(PART_KEYS.length - 1);
  });

  it("steps one part to its next option and wraps round", () => {
    const start = COSTUMES[0];
    const next = withPart(start, "cloak", 1);
    expect(next.parts.cloak).toBe((start.parts.cloak + 1) % PARTS.cloak.options.length);
    expect(withPart(start, "hair", -1).parts.hair).toBe(PARTS.hair.options.length - 1);
  });

  it("gives seats different presets", () => {
    expect(costumeForSeat(0).id).not.toBe(costumeForSeat(1).id);
  });
});
