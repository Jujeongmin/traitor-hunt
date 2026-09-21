import { describe, expect, it } from "vitest";
import { createLobby, joinLobby, newMonster, startMatch } from "../../src/game/match/lifecycle";
import { BOSS_ID } from "../../src/game/match/objectives";
import { bearingTo, guideFor } from "../../src/game/match/guide";
import type { PublicMatch } from "../../src/game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";

const layout = parseLevel(RUINS, TILE_SIZE);
const here = { x: layout.playerSpawn.x, z: layout.playerSpawn.z };
const nearestTo = (from: { x: number; z: number }, spots: readonly { x: number; z: number }[]) =>
  spots.slice().sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];

function playing(): PublicMatch {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return match;
}

describe("guideFor", () => {
  it("sends you to a key first, then to the gate once both are in", () => {
    const match = playing();
    const shard = guideFor(layout, match, here);
    expect(shard?.at).toEqual(nearestTo(here, layout.shards));
    expect(shard?.text).toContain("광석");
    match.objectives.shards = layout.shards.map(() => true);
    const gate = guideFor(layout, match, here);
    expect(gate?.at).toEqual(layout.gates.find((g) => g.n === 1));
    expect(gate?.text).toContain("E");
  });

  it("points at the nearer candle, the altar, the boss and then the way out", () => {
    const match = playing();
    match.objectives.stage = "devices";
    const near = nearestTo(here, layout.devices);
    expect(guideFor(layout, match, here)?.at).toEqual(near);

    match.objectives.stage = "seal";
    expect(guideFor(layout, match, here)?.at).toEqual(layout.altar);

    match.objectives.stage = "boss";
    match.monsters[BOSS_ID] = newMonster("boss", 40, 40);
    expect(guideFor(layout, match, here)?.at).toMatchObject({ x: 40, z: 40 });
    match.monsters[BOSS_ID].alive = false;
    expect(guideFor(layout, match, here)?.text).toContain("보스");

    match.objectives.stage = "exit";
    expect(guideFor(layout, match, here)?.at).toEqual(layout.exits[0]);
    expect(guideFor(layout, match, here)?.text).toContain("F");
  });

  it("has nothing to say outside a running match", () => {
    const match = playing();
    match.phase = "ended";
    expect(guideFor(layout, match, here)).toBeNull();
  });
});

describe("bearingTo", () => {
  it("is zero straight ahead and turns with the target", () => {
    // Facing yaw 0 looks down -z.
    expect(bearingTo({ x: 0, z: 0, yaw: 0 }, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(bearingTo({ x: 0, z: 0, yaw: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(bearingTo({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 5 })).toBeCloseTo(Math.PI);
    // Turning to face the target brings it back to the middle.
    expect(bearingTo({ x: 0, z: 0, yaw: -Math.PI / 2 }, { x: 5, z: 0 })).toBeCloseTo(0);
  });
});
