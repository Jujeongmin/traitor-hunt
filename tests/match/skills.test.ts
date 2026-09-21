import { describe, expect, it } from "vitest";
import { PLAYER_HP } from "../../src/game/match/constants";
import { useSkill } from "../../src/game/match/damage";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { SKILLS } from "../../src/game/match/skills";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000;
const at = (x: number, z: number, yaw = 0, block = false): Pose => ({ x, z, yaw, block });

// Two zombies next to a: one in front (at -z), one right behind; b stands close, c and d far off.
function playing(classes: Record<string, string>) {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  match.classes = classes;
  const secret = startMatch(match, 0, () => 0.6, [
    { id: "zombie-0", x: 10, z: 8.5 },
    { id: "zombie-1", x: 10, z: 11.5 },
  ]);
  const poses: Poses = { a: at(10, 10), b: at(12, 10), c: at(0, 0), d: at(1, 0) };
  return { match, secret, poses };
}

describe("class skills", () => {
  it("gives every class its own skill", () => {
    const names = Object.values(SKILLS).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the warrior's spin hits monsters on every side", () => {
    const { match, secret, poses } = playing({ a: "warrior" });
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(100 - SKILLS.warrior.damage);
    expect(match.monsters["zombie-1"].hp).toBe(100 - SKILLS.warrior.damage);
  });

  it("the monk's blows stun only what is in front", () => {
    const { match, secret, poses } = playing({ a: "monk" });
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(match.monsters["zombie-0"].stunnedUntil).toBe(T + SKILLS.monk.stunMs);
    expect(match.monsters["zombie-1"].stunnedUntil).toBe(0);
  });

  it("the rogue's strike lands on one monster only", () => {
    const { match, secret, poses } = playing({ a: "rogue" });
    // Both zombies in front now.
    match.monsters["zombie-1"].z = 8;
    useSkill(match, secret, "a", poses.a, poses, T);
    const hurt = ["zombie-0", "zombie-1"].filter((id) => match.monsters[id].hp < 100);
    expect(hurt).toEqual(["zombie-0"]);
  });

  it("the cleric heals themself and players close by, never past full health", () => {
    const { match, secret, poses } = playing({ a: "cleric" });
    secret.hp.a = 50;
    secret.hp.b = 90;
    secret.hp.c = 40;
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(secret.hp.a).toBe(50 + SKILLS.cleric.heal);
    expect(secret.hp.b).toBe(PLAYER_HP);
    expect(secret.hp.c).toBe(40);
    expect(match.monsters["zombie-0"].hp).toBe(100);
  });

  it("waits out its cooldown and needs the guard down", () => {
    const { match, secret, poses } = playing({ a: "warrior" });
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(() => useSkill(match, secret, "a", poses.a, poses, T + 1000)).toThrow("too_fast");
    expect(() => useSkill(match, secret, "a", at(10, 10, 0, true), poses, T + SKILLS.warrior.cooldownMs)).toThrow("blocking");
    expect(() => useSkill(match, secret, "a", poses.a, poses, T + SKILLS.warrior.cooldownMs)).not.toThrow();
  });
});
