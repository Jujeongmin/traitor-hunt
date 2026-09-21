import { describe, expect, it } from "vitest";
import { COSTUMES, withPart } from "../../src/game/render/costumes";
import { meshDye } from "../../src/game/render/dyes";

describe("dyes", () => {
  it("leaves the pack colours alone", () => {
    for (const mesh of ["Hair01", "Head01_Male", "Body05", "Cloak02", "OHS03Polyart"]) {
      expect(meshDye(COSTUMES[0], mesh)).toBeNull();
    }
  });

  it("paints the hair with its own base colour kept for shading", () => {
    const blond = withPart(COSTUMES[0], "hairColor", 3);
    expect(meshDye(blond, "Hair01")?.paint).toEqual({ rgb: [240, 205, 110], base: [225, 136, 19] });
    expect(meshDye(blond, "Body05")).toBeNull();
  });

  it("tans the skin on the head and the body only", () => {
    const tanned = withPart(COSTUMES[0], "skin", 2);
    expect(meshDye(tanned, "Head02_Female")?.skin).toEqual([190, 126, 76]);
    expect(meshDye(tanned, "Body10")?.skin).toEqual([190, 126, 76]);
    expect(meshDye(tanned, "Cloak02")).toBeNull();
  });

  it("turns the clothes and the cloak separately", () => {
    const dyed = withPart(withPart(COSTUMES[0], "clothColor", 1), "cloakColor", 6);
    expect(meshDye(dyed, "Body05")?.hue).toEqual({ degrees: 60, saturation: 1 });
    expect(meshDye(dyed, "Cloak03")?.hue).toEqual({ degrees: 0, saturation: 0 });
    expect(meshDye(dyed, "Shield08Polyart")).toBeNull();
  });
});
