import { describe, expect, it } from "vitest";
import { CLASSES, WEAPONS, classFor, classForSeat, readClass } from "../../src/game/match/classes";
import { monsterAttack, strikeMonster } from "../../src/game/match/damage";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { facing, inStrikeReach } from "../../src/game/match/melee";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000;
// yaw 0 faces -z, so a monster at a smaller z stands in front.
const at = (x: number, z: number, yaw = 0, block = false): Pose => ({ x, z, yaw, block });

// zombie-0 at (10, 10). a and b stand just behind it (+z) facing it.
function playing(classes: Record<string, string>) {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  match.classes = classes;
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  const poses: Poses = { a: at(10, 11.5), b: at(10.5, 11.5), c: at(0, 0), d: at(0, 1) };
  return { match, secret, poses };
}

describe("classes", () => {
  it("has a striker who hits hard and a guardian who blocks well", () => {
    expect(CLASSES).toEqual(["striker", "guardian"]);
    expect(WEAPONS.striker.damage).toBeGreaterThan(WEAPONS.guardian.damage);
    expect(WEAPONS.guardian.block).toBeGreaterThan(WEAPONS.striker.block);
  });

  it("reads only known classes and gives the seats a mix when nobody picked", () => {
    expect(readClass("guardian")).toBe("guardian");
    expect(readClass("archer")).toBeNull();
    expect(classForSeat(0)).not.toBe(classForSeat(1));
    expect(classFor({ a: "guardian" }, "a", 0)).toBe("guardian");
    expect(classFor({}, "bot-1", 1)).toBe(classForSeat(1));
    expect(classFor(undefined, "a", 2)).toBe(classForSeat(2));
  });
});

describe("melee reach", () => {
  const sword = WEAPONS.striker;

  it("reaches a monster close in front and misses one behind or too far", () => {
    expect(inStrikeReach(at(10, 11.5), { x: 10, z: 10 }, sword)).toBe(true);
    expect(inStrikeReach(at(10, 11.5, Math.PI), { x: 10, z: 10 }, sword)).toBe(false);
    expect(inStrikeReach(at(10, 20), { x: 10, z: 10 }, sword)).toBe(false);
  });

  it("knows which way a body faces", () => {
    expect(facing(at(0, 0), { x: 0, z: -5 }, Math.PI / 4)).toBe(true);
    expect(facing(at(0, 0), { x: 5, z: 0 }, Math.PI / 4)).toBe(false);
  });
});

describe("striking by class", () => {
  it("deals the attacker's weapon damage", () => {
    const { match, secret, poses } = playing({ a: "striker", b: "guardian" });
    const hp = match.monsters["zombie-0"].hp;
    strikeMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(hp - WEAPONS.striker.damage);
    strikeMonster(match, secret, "b", "zombie-0", poses.b, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(Math.max(0, hp - WEAPONS.striker.damage - WEAPONS.guardian.damage));
  });

  it("holds each attacker to their own weapon's pace", () => {
    const { match, secret, poses } = playing({ a: "striker" });
    match.monsters["zombie-0"].hp = 10_000;
    strikeMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    expect(() => strikeMonster(match, secret, "a", "zombie-0", poses.a, poses, T + WEAPONS.striker.intervalMs - 1))
      .toThrow("too_fast");
    strikeMonster(match, secret, "a", "zombie-0", poses.a, poses, T + WEAPONS.striker.intervalMs);
  });

  it("misses a monster out of reach or behind you, and cannot swing while blocking", () => {
    const { match, secret, poses } = playing({ a: "striker" });
    expect(() => strikeMonster(match, secret, "a", "zombie-0", at(10, 20), poses, T)).toThrow("out_of_range");
    expect(() => strikeMonster(match, secret, "a", "zombie-0", at(10, 11.5, Math.PI), poses, T)).toThrow("out_of_range");
    expect(() => strikeMonster(match, secret, "a", "zombie-0", at(10, 11.5, 0, true), poses, T)).toThrow("blocking");
  });
});

describe("blocking", () => {
  it("cuts a monster's hit by the blocker's shield, only when facing it", () => {
    const { match, secret } = playing({ a: "guardian", b: "striker" });
    const full = 20;
    monsterAttack(match, secret, "a", "zombie-0", "a", at(10, 11.5, 0, true), T);
    expect(100 - secret.hp.a).toBe(Math.round(full * (1 - WEAPONS.guardian.block)));
    monsterAttack(match, secret, "a", "zombie-0", "b", at(10, 11.5, Math.PI, true), T + 5_000);
    expect(100 - secret.hp.b).toBe(full);
  });
});
