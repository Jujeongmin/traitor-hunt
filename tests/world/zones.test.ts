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
