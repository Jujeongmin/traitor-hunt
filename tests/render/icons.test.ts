import { describe, expect, it } from "vitest";
import { ICON_SIZE, iconGrids, knownIconLetters, skillIconId } from "../../src/game/render/icons";
import { CLASSES } from "../../src/game/combat/classes";
import { SKILLS } from "../../src/game/combat/skills";
import { ITEM_IDS } from "../../src/game/account/items";

describe("icons", () => {
  it("are all square grids of known colours", () => {
    const letters = knownIconLetters();
    for (const [id, rows] of Object.entries(iconGrids())) {
      expect(rows, id).toHaveLength(ICON_SIZE);
      for (const row of rows) {
        expect(row, id).toHaveLength(ICON_SIZE);
        for (const ch of row) expect(letters.has(ch), `${id}: ${ch}`).toBe(true);
      }
    }
  });

  it("cover every skill, potion and piece of gear", () => {
    const grids = iconGrids();
    for (const c of CLASSES) SKILLS[c].forEach((_, i) => expect(grids[skillIconId(c, i)], `${c} ${i}`).toBeDefined());
    for (const id of ITEM_IDS) expect(grids[id.replace(/_\d$/, "")] ?? grids[id], id).toBeDefined();
  });
});
