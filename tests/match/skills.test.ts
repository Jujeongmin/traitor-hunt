import { describe, expect, it } from "vitest";
import { useSkill } from "../../src/game/match/damage";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import { SKILLS } from "../../src/game/match/skills";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000;
const at = (x: number, z: number, yaw = 0, block = false): Pose => ({ x, z, yaw, block });

// Two zombies: one in front of a (at -z), one right behind.
function playing(classes: Record<string, string>) {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  match.classes = classes;
  const secret = startMatch(match, 0, () => 0.6, [
    { id: "zombie-0", x: 10, z: 8.5 },
    { id: "zombie-1", x: 10, z: 11.5 },
  ]);
  // The traitor must not be a, whatever the seat draw gave.
  const poses: Poses = { a: at(10, 10), b: at(0, 0), c: at(0, 1), d: at(1, 0) };
  return { match, secret, poses };
}

describe("class skills", () => {
  it("gives each class a different skill", () => {
    expect(SKILLS.striker.arc).toBeGreaterThan(SKILLS.guardian.arc);
    expect(SKILLS.guardian.stunMs).toBeGreaterThan(0);
    expect(SKILLS.striker.damage).toBeGreaterThan(SKILLS.guardian.damage);
  });

  it("the striker's spin hits monsters on every side", () => {
    const { match, secret, poses } = playing({ a: "striker" });
    const hp = match.monsters["zombie-0"].hp;
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(match.monsters["zombie-0"].hp).toBe(Math.max(0, hp - SKILLS.striker.damage));
    expect(match.monsters["zombie-1"].hp).toBe(Math.max(0, hp - SKILLS.striker.damage));
  });

  it("the guardian's bash stuns only what is in front", () => {
    const { match, secret, poses } = playing({ a: "guardian" });
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(match.monsters["zombie-0"].stunnedUntil).toBe(T + SKILLS.guardian.stunMs);
    expect(match.monsters["zombie-1"].stunnedUntil).toBe(0);
  });

  it("waits out its cooldown and needs the shield down", () => {
    const { match, secret, poses } = playing({ a: "striker" });
    useSkill(match, secret, "a", poses.a, poses, T);
    expect(() => useSkill(match, secret, "a", poses.a, poses, T + 1000)).toThrow("too_fast");
    expect(() => useSkill(match, secret, "a", at(10, 10, 0, true), poses, T + SKILLS.striker.cooldownMs)).toThrow("blocking");
    expect(() => useSkill(match, secret, "a", poses.a, poses, T + SKILLS.striker.cooldownMs)).not.toThrow();
  });
});
