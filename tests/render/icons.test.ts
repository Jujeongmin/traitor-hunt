import { describe, expect, it } from "vitest";
import { ICON_IDS, iconFor, skillIconId } from "../../src/game/render/icons";
import { CLASSES } from "../../src/game/combat/classes";
import { SKILLS } from "../../src/game/combat/skills";
import { ITEM_IDS } from "../../src/game/account/items";

describe("icons", () => {
  it("cover every skill, and every item with a picture of its own", async () => {
    for (const c of CLASSES) SKILLS[c].forEach((_, i) => expect(iconFor(skillIconId(c, i)), `${c} ${i}`).toMatch(/assets\/ui\/icons\//));
    // The pictures live with the other assets on the deploy branch; where they are here, all must be.
    const { existsSync } = await import("node:fs");
    const here = existsSync("public/assets/ui/items");
    for (const id of ITEM_IDS) {
      expect(iconFor(id), id).toMatch(new RegExp(`assets/ui/items/${id}\\.png$`));
      if (here) expect(existsSync(`public/assets/ui/items/${id}.png`), id).toBe(true);
    }
    if (here) for (const id of ICON_IDS) expect(existsSync(`public/assets/ui/icons/${id}.png`), id).toBe(true);
  });
});
