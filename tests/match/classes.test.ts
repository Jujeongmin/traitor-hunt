import { describe, expect, it } from "vitest";
import { CLASSES, WEAPONS, classFor, classForSeat, readClass } from "../../src/game/match/classes";
import { shootMonster } from "../../src/game/match/damage";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000;
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });

function playing(classes: Record<string, string>) {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  match.classes = classes;
  const secret = startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  const poses: Poses = { a: at(8, 10), b: at(8, 11), c: at(0, 0), d: at(0, 1) };
  return { match, secret, poses };
}

describe("classes", () => {
  it("has a mage who fires fast and light and an archer who fires slow and hard", () => {
    expect(CLASSES).toEqual(["mage", "archer"]);
    expect(WEAPONS.mage.intervalMs).toBeLessThan(WEAPONS.archer.intervalMs);
    expect(WEAPONS.mage.damage).toBeLessThan(WEAPONS.archer.damage);
  });

  it("reads only known classes and gives the seats a mix when nobody picked", () => {
    expect(readClass("archer")).toBe("archer");
    expect(readClass("gunner")).toBeNull();
    expect(classForSeat(0)).not.toBe(classForSeat(1));
    expect(classFor({ a: "archer" }, "a", 0)).toBe("archer");
    expect(classFor({}, "bot-1", 1)).toBe(classForSeat(1));
    expect(classFor(undefined, "a", 2)).toBe(classForSeat(2));
  });
});

describe("shooting by class", () => {
  it("deals the shooter's weapon damage", () => {
    const { match, secret, poses } = playing({ a: "mage", b: "archer" });
    const hp = match.monsters["zombie-0"].hp;
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(hp - WEAPONS.mage.damage);
    shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(Math.max(0, hp - WEAPONS.mage.damage - WEAPONS.archer.damage));
  });

  it("holds each shooter to their own weapon's pace", () => {
    const { match, secret, poses } = playing({ a: "mage", b: "archer" });
    match.monsters["zombie-0"].hp = 10_000;
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + WEAPONS.mage.intervalMs);
    shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T);
    expect(() => shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T + WEAPONS.mage.intervalMs))
      .toThrow("too_fast");
    shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T + WEAPONS.archer.intervalMs);
  });
});
