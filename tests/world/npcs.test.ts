import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import { gridRoute } from "../../src/game/rules/pathing";
import { costumeById } from "../../src/game/render/costumes";
import { NPCS, npcNear, npcSpot, TALK_RANGE } from "../../src/game/world/npcs";
import { START_ZONE, zoneLayout } from "../../src/game/world/zones";

describe("village NPCs", () => {
  const village = zoneLayout(START_ZONE);

  it("stand on open ground you can walk to from the spawn, apart from each other", () => {
    for (const npc of NPCS) {
      const at = npcSpot(npc.id);
      expect(solidAt(village, at.x, at.z)).toBe(false);
      expect(gridRoute(village, village.playerSpawn, at)).not.toBeNull();
      expect(costumeById(npc.costume)).not.toBeNull();
    }
    const [a, b] = NPCS.map((n) => npcSpot(n.id));
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(TALK_RANGE * 2);
  });

  it("can be talked to only close by", () => {
    const at = npcSpot("merchant");
    expect(npcNear(at.x + 1, at.z)).toBe("merchant");
    expect(npcNear(at.x + TALK_RANGE + 1, at.z)).not.toBe("merchant");
  });
});
