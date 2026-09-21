import { describe, expect, it } from "vitest";
import { MONSTER_STATS } from "../../src/game/match/constants";
import { monsterAttack } from "../../src/game/match/damage";
import { createLobby, joinLobby, newMonster, startMatch } from "../../src/game/match/lifecycle";
import { stepMonsterAi } from "../../src/game/match/monsterAi";
import type { Pose, Poses } from "../../src/game/match/types";
import { reaches } from "../../src/game/match/view";
import { HIGH_H, LOW_H } from "../../src/game/rules/platforms";

const at = (x: number, z: number, y = 0): Pose => ({ x, z, yaw: 0, y });
const never = () => false;
const open = () => false;

// zombie-0 at (10,10), boss-0 at (30,10).
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  match.monsters["boss-0"] = newMonster("boss", 30, 10);
  return { match, secret };
}

describe("reaches", () => {
  it("lets a zombie reach a low crate but not a high block, and a boss reach anything", () => {
    expect(reaches("zombie", 0)).toBe(true);
    expect(reaches("zombie", LOW_H)).toBe(true);
    expect(reaches("zombie", HIGH_H)).toBe(false);
    expect(reaches("boss", HIGH_H)).toBe(true);
    expect(MONSTER_STATS.zombie.reachY).toBeLessThan(HIGH_H);
  });
});

describe("monsterAttack and height", () => {
  it("misses a player standing on a high block and hits one on a low crate", () => {
    const { match, secret } = playing();
    const before = secret.hp.b;
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", at(10, 11, HIGH_H), 100_000))
      .toThrow(/out_of_reach/);
    expect(secret.hp.b).toBe(before);
    monsterAttack(match, secret, "a", "zombie-0", "b", at(10, 11, LOW_H), 100_000);
    expect(secret.hp.b).toBeLessThan(before);
  });

  it("lets the boss hit a player on a high block", () => {
    const { match, secret } = playing();
    const before = secret.hp.b;
    monsterAttack(match, secret, "a", "boss-0", "b", at(30, 11, HIGH_H), 100_000);
    expect(secret.hp.b).toBeLessThan(before);
  });
});

describe("stepMonsterAi and height", () => {
  it("a zombie ignores a player out of its reach and goes for one it can hit", () => {
    const { match } = playing();
    const high: Poses = { a: at(10, 12, HIGH_H), b: null, c: null, d: null };
    expect(stepMonsterAi(match, high, open, 0.1, 0, never).updates.filter((u) => u.id === "zombie-0")).toEqual([]);
    const both: Poses = { a: at(10, 12, HIGH_H), b: at(10, 16, LOW_H), c: null, d: null };
    const step = stepMonsterAi(match, both, open, 0.1, 0, never);
    const moved = step.updates.find((u) => u.id === "zombie-0")!;
    // Walks toward b (further, but reachable), so it moves in +z.
    expect(moved.z).toBeGreaterThan(10);
  });

  it("the boss still chases a player up high", () => {
    const { match } = playing();
    const poses: Poses = { a: at(30, 14, HIGH_H), b: null, c: null, d: null };
    const step = stepMonsterAi(match, poses, open, 0.1, 0, never);
    expect(step.updates.find((u) => u.id === "boss-0")?.z).toBeGreaterThan(10);
  });
});
