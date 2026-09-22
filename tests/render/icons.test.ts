import { describe, expect, it } from "vitest";
import { ICON_SIZE, iconFor, iconGrids, knownIconLetters, skillIconId } from "../../src/game/render/icons";
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

  it("cover every skill, and every item with a picture of its own", async () => {
    const grids = iconGrids();
    for (const c of CLASSES) SKILLS[c].forEach((_, i) => expect(grids[skillIconId(c, i)], `${c} ${i}`).toBeDefined());
    // The pictures live with the other assets on the deploy branch; where they are here, all must be.
    const { existsSync } = await import("node:fs");
    const here = existsSync("public/assets/ui/items");
    for (const id of ITEM_IDS) {
      expect(iconFor(id), id).toMatch(new RegExp(`assets/ui/items/${id}\\.png$`));
      if (here) expect(existsSync(`public/assets/ui/items/${id}.png`), id).toBe(true);
    }
  });
});
