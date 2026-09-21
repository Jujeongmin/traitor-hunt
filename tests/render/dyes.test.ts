import { describe, expect, it } from "vitest";
import { COSTUMES, withPart } from "../../src/game/render/costumes";
import { meshDye } from "../../src/game/render/dyes";
import { HEROES, isWeaponMesh } from "../../src/game/render/heroes";

describe("dyes", () => {
  it("leaves the pack colours alone", () => {
    for (const mesh of ["Warrior_Body", "Warrior_Sword", "Face"]) expect(meshDye(COSTUMES[0], mesh)).toBeNull();
  });

  it("dyes the clothes and the weapon separately", () => {
    const dyed = withPart(withPart(COSTUMES[0], "clothColor", 1), "weaponColor", 6);
    expect(meshDye(dyed, "Ranger")?.hue).toEqual({ degrees: 60, saturation: 1 });
    expect(meshDye(dyed, "Ranger_Bow")?.hue).toEqual({ degrees: 0, saturation: 0 });
  });

  it("paints the skin on the body, never on the weapon", () => {
    const tanned = withPart(COSTUMES[0], "skin", 2);
    expect(meshDye(tanned, "Face")?.skin).toEqual([196, 132, 86]);
    expect(meshDye(tanned, "Wizard_Staff")).toBeNull();
  });

  it("knows each hero's weapon mesh", () => {
    expect(["Warrior_Sword", "Ranger_Bow", "Wizard_Staff", "Cleric_Staff", "Rogue_Dagger"].every(isWeaponMesh)).toBe(true);
    expect(isWeaponMesh("Monk")).toBe(false);
    expect(Object.keys(HEROES)).toHaveLength(6);
  });
});
