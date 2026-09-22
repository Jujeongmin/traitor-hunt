import { describe, expect, it } from "vitest";
import { solidAt } from "../../src/game/rules/levelLayout";
import {
  START_ZONE, ZONES, ZONE_IDS, arrivalFrom, channelRoomId, portalsOf, readChannelRoom, readZone, zoneLayout,
} from "../../src/game/world/zones";

describe("zones", () => {
  it("parses every map, with one portal per listed destination", () => {
    for (const id of ZONE_IDS) {
      const layout = zoneLayout(id);
      expect(layout.portals).toHaveLength(ZONES[id].portals.length);
    }
  });

  it("joins the zones both ways: every portal has one leading back", () => {
    for (const id of ZONE_IDS) {
      for (const p of portalsOf(id)) expect(portalsOf(p.to).map((q) => q.to)).toContain(id);
    }
  });

  it("sets you down on open ground beside the portal you came through", () => {
    for (const id of ZONE_IDS) {
      for (const p of portalsOf(id)) {
        const at = arrivalFrom(id, p.to);
        expect(solidAt(zoneLayout(id), at.x, at.z)).toBe(false);
        expect(Math.hypot(at.x - p.x, at.z - p.z)).toBeLessThanOrEqual(zoneLayout(id).tileSize + 0.01);
      }
    }
  });

  it("reaches every portal, monster and the boss on foot from the spawn, over wide fields", () => {
    for (const id of ZONE_IDS) {
      const layout = zoneLayout(id);
      const t = layout.tileSize;
      const cell = (p: { x: number; z: number }) => `${Math.floor(p.x / t)},${Math.floor(p.z / t)}`;
      const seen = new Set([cell(layout.playerSpawn)]);
      const queue = [[Math.floor(layout.playerSpawn.x / t), Math.floor(layout.playerSpawn.z / t)]];
      while (queue.length > 0) {
        const [c, r] = queue.shift()!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= layout.cols || nr >= layout.rows || layout.solid[nr][nc] || seen.has(`${nc},${nr}`)) continue;
          seen.add(`${nc},${nr}`);
          queue.push([nc, nr]);
        }
      }
      for (const p of [...layout.portals, ...layout.zombieSpawns, ...(layout.bossSpawn ? [layout.bossSpawn] : [])]) {
        expect(seen.has(cell(p))).toBe(true);
      }
      expect(layout.cols * t).toBeGreaterThanOrEqual(120);
    }
    expect(zoneLayout("forest1").zombieSpawns.length).toBeGreaterThanOrEqual(20);
    expect(zoneLayout("boss").bossSpawn).not.toBeNull();
  });

  it("keeps the village and the first field free", () => {
    expect(START_ZONE).toBe("village");
    expect(ZONE_IDS.filter((z) => !ZONES[z].paid)).toEqual(["village", "forest1"]);
  });

  it("names channel rooms and reads them back", () => {
    const id = channelRoomId("w2", "forest1", 3);
    expect(readChannelRoom(id)).toEqual({ world: "w2", zone: "forest1", channel: 3 });
    expect(readChannelRoom("de-w1-abc")).toBeNull();
    expect(readZone("moon")).toBeNull();
  });
});
