import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import { gridRoute } from "../../src/game/rules/pathing";
import { NPCS, npcFacing, npcNear, npcSpot, TALK_RANGE } from "../../src/game/world/npcs";
import { START_ZONE, zoneLayout } from "../../src/game/world/zones";

describe("village NPCs", () => {
  const village = zoneLayout(START_ZONE);

  it("stand on open ground you can walk to from the spawn, apart from each other", () => {
    for (const npc of NPCS) {
      const at = npcSpot(npc.id);
      expect(solidAt(village, at.x, at.z)).toBe(false);
      expect(gridRoute(village, village.playerSpawn, at)).not.toBeNull();
      // Their own models, never a player class's hero.
      expect(npc.model.startsWith("hero_")).toBe(false);
    }
    const [a, b] = NPCS.map((n) => npcSpot(n.id));
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(TALK_RANGE * 2);
  });

  it("stand outside the door of their building, looking out", () => {
    const t = village.tileSize;
    for (const npc of NPCS) {
      const at = npcSpot(npc.id);
      const out = npcFacing(npc.id);
      const middle = { x: (npc.house[0] + 1) * t, z: (npc.house[1] + 1) * t };
      // Straight out from the middle of the building, just past its walls.
      expect((at.x - middle.x) * out.x + (at.z - middle.z) * out.z).toBeGreaterThan(t);
      expect(Math.hypot(at.x - middle.x, at.z - middle.z)).toBeLessThan(t * 1.5);
      expect(solidAt(village, middle.x, middle.z)).toBe(true);
    }
  });

  it("can be talked to only close by", () => {
    const at = npcSpot("merchant");
    expect(npcNear(at.x + 1, at.z)).toBe("merchant");
    expect(npcNear(at.x + TALK_RANGE + 1, at.z)).not.toBe("merchant");
  });
});

describe("NPC models", () => {
  it("are in the model manifest, with the clips they use", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const manifest = JSON.parse(readFileSync("public/assets/models/manifest.json", "utf8")) as Record<string, unknown>;
    const names = Object.keys((manifest.models as Record<string, unknown>) ?? manifest);
    for (const npc of NPCS) {
      expect(names).toContain(npc.model);
      const file = `public/assets/models/${npc.model}.glb`;
      if (!existsSync(file)) continue;
      const bytes = readFileSync(file);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as { animations?: { name: string }[] };
      const clips = (json.animations ?? []).map((a) => a.name);
      expect(clips).toContain(npc.idle);
      expect(clips).toContain(npc.greet);
    }
  });
});
