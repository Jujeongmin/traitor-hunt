import { WEAPONS, classForSeat } from "../../src/game/match/classes";
import { describe, expect, it } from "vitest";
import {
  MONSTER_DEATH_BODY_DAMAGE, ZOMBIE_HP, MONSTER_STATS, POSSESS_COOLDOWN_MS, POSSESS_DURATION_MS,
  ZOMBIE_ATTACK_DAMAGE, ZOMBIE_ATTACK_INTERVAL_MS,
} from "../../src/game/match/constants";
import {
  applyMonsterPoses, monsterAttack, monsterAuthority, reachExit, shootMonster,
} from "../../src/game/match/damage";
import { createLobby, joinLobby, newMonster, startMatch } from "../../src/game/match/lifecycle";
import { startPossession } from "../../src/game/match/possession";
import type { Pose, Poses } from "../../src/game/match/types";

const T = 100_000; // well after the first possession is ready
// "a" sits in seat 0 and picked nothing, so it carries that seat's weapon.
const W = WEAPONS[classForSeat(0)];
const at = (x: number, z: number): Pose => ({ x, z, yaw: 0 });

// Traitor is "c". zombie-0 at (10,10), zombie-1 at (50,10).
// a (0,10), b (8,10), c (5,10), d (40,10).
function playing() {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  const secret = startMatch(match, 0, () => 0.6, [
    { id: "zombie-0", x: 10, z: 10 },
    { id: "zombie-1", x: 50, z: 10 },
  ]);
  const poses: Poses = { a: at(0, 10), b: at(8, 10), c: at(5, 10), d: at(40, 10) };
  return { match, secret, poses };
}

function possessing() {
  const s = playing();
  startPossession(s.match, s.secret, "c", "zombie-0", s.poses.c, T);
  return s;
}

describe("monsterAuthority / applyMonsterPoses", () => {
  it("gives unpossessed monsters to the first active player and possessed ones to the traitor", () => {
    const { match, secret } = possessing();
    expect(monsterAuthority(match, secret, "zombie-1")).toBe("a");
    expect(monsterAuthority(match, secret, "zombie-0")).toBe("c");
    match.dead.push("a");
    expect(monsterAuthority(match, secret, "zombie-1")).toBe("b");
  });

  it("moves only monsters the caller controls, alive, with finite numbers", () => {
    const { match, secret } = possessing();
    match.monsters["zombie-1"].alive = true;
    applyMonsterPoses(match, secret, "a", [
      { id: "zombie-0", x: 1, z: 1, yaw: 1 },
      { id: "zombie-1", x: 45, z: 12, yaw: 2 },
      { id: "zombie-9", x: 0, z: 0, yaw: 0 },
    ], T + 1);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 10, z: 10 });
    expect(match.monsters["zombie-1"]).toMatchObject({ x: 45, z: 12, yaw: 2 });

    applyMonsterPoses(match, secret, "c", [{ id: "zombie-0", x: 11, z: Number.NaN, yaw: 0 }], T + 2);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 10, z: 10 });
    applyMonsterPoses(match, secret, "c", [{ id: "zombie-0", x: 11, z: 9, yaw: 0.5 }], T + 3);
    expect(match.monsters["zombie-0"]).toMatchObject({ x: 11, z: 9, yaw: 0.5 });
  });
});

describe("shootMonster", () => {
  it("damages, records and kills once enough hits land", () => {
    const { match, secret, poses } = playing();
    const shots = Math.ceil(ZOMBIE_HP / W.damage);
    for (let i = 0; i < shots; i++) shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + i * W.intervalMs);
    expect(match.monsters["zombie-0"]).toMatchObject({ hp: 0, alive: false });
    expect(secret.stats.a).toMatchObject({ monsterDamage: ZOMBIE_HP, monsterKills: 1 });
    expect(secret.lastShotAt.a).toBe(T + (shots - 1) * W.intervalMs);
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + shots * W.intervalMs))
      .toThrow("monster_dead");
  });

  it("enforces the fire interval", () => {
    const { match, secret, poses } = playing();
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T);
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + W.intervalMs - 1)).toThrow("too_fast");
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + W.intervalMs)).not.toThrow();
  });

  it("checks range from the shooter's reported position", () => {
    const { match, secret, poses } = playing();
    match.monsters["zombie-1"].x = 70;
    expect(() => shootMonster(match, secret, "a", "zombie-1", poses.a, poses, T)).toThrow("out_of_range");
    expect(() => shootMonster(match, secret, "a", "zombie-0", null, poses, T)).toThrow("out_of_range");
  });

  it("refuses shooters who cannot act and targets that do not exist", () => {
    const { match, secret, poses } = possessing();
    expect(() => shootMonster(match, secret, "c", "zombie-1", poses.c, poses, T + 1)).toThrow("unavailable");
    expect(() => shootMonster(match, secret, "a", "zombie-9", poses.a, poses, T + 1)).toThrow("no_monster");
    match.escaped.push("b");
    expect(() => shootMonster(match, secret, "b", "zombie-0", poses.b, poses, T + 1)).toThrow("unavailable");
    match.phase = "ended";
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1)).toThrow("not_playing");
  });

  it("hurts the possessing body and makes it scream to nearby players", () => {
    const { match, secret, poses } = possessing();
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    const link = Math.round(W.damage * 0.4);
    expect(events).toEqual([
      { type: "pain", x: 5, z: 10, to: ["a", "b"] },
      { type: "private", account: "c" },
    ]);
    expect(secret.hp.c).toBe(100 - link);
    expect(secret.stats.a.traitorDamage).toBe(link);
    expect(secret.possession).not.toBeNull();
  });

  it("hits the body harder and ends the possession when the possessed monster dies", () => {
    const { match, secret, poses } = possessing();
    match.monsters["zombie-0"].hp = 20;
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    expect(secret.hp.c).toBe(100 - (Math.round(20 * 0.4) + MONSTER_DEATH_BODY_DAMAGE));
    expect(secret.possession).toBeNull();
    expect(secret.readyAt).toBe(T + 1 + POSSESS_COOLDOWN_MS);
    expect(events).toContainEqual({ type: "possession", monsterId: "zombie-0", active: false, endsAt: null });
    expect(secret.stats.a.monsterKills).toBe(1);
  });

  it("can kill the traitor through the link", () => {
    const { match, secret, poses } = possessing();
    secret.hp.c = 10;
    shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + 1);
    expect(secret.hp.c).toBe(0);
    expect(match.dead).toEqual(["c"]);
    expect(secret.possession).toBeNull();
    expect(secret.stats.a.traitorDamage).toBe(10);
  });

  it("does no link damage once the possession has run out", () => {
    const { match, secret, poses } = possessing();
    const events = shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T + POSSESS_DURATION_MS);
    expect(secret.hp.c).toBe(100);
    expect(events).toEqual([
      { type: "possession", monsterId: "zombie-0", active: false, endsAt: null },
      { type: "private", account: "c" },
    ]);
  });

  it("does not let a bound player shoot", () => {
    const { match, secret, poses } = playing();
    match.bound.a = T + 1;
    expect(() => shootMonster(match, secret, "a", "zombie-0", poses.a, poses, T)).toThrow("bound");
  });
});

describe("monsterAttack", () => {
  it("lets the host's monster hit a nearby player on an interval", () => {
    const { match, secret, poses } = playing();
    monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T);
    expect(secret.hp.b).toBe(100 - ZOMBIE_ATTACK_DAMAGE);
    expect(match.monsters["zombie-0"].attackReadyAt).toBe(T + ZOMBIE_ATTACK_INTERVAL_MS);
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + 1)).toThrow("too_fast");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + ZOMBIE_ATTACK_INTERVAL_MS)).not.toThrow();
  });

  it("only takes orders from the monster's authority", () => {
    const { match, secret, poses } = possessing();
    expect(() => monsterAttack(match, secret, "b", "zombie-1", "d", at(50, 10), T + 1)).toThrow("not_authority");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T + 1)).toThrow("not_authority");
    monsterAttack(match, secret, "c", "zombie-0", "b", poses.b, T + 1);
    expect(secret.stats.c.possessedDamage).toBe(ZOMBIE_ATTACK_DAMAGE);
  });

  it("refuses stunned monsters and far targets", () => {
    const { match, secret, poses } = playing();
    match.monsters["zombie-0"].stunnedUntil = T + 10;
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "b", poses.b, T)).toThrow("stunned");
    expect(() => monsterAttack(match, secret, "a", "zombie-0", "d", poses.d, T + 10)).toThrow("out_of_range");
  });

  it("uses the boss's own reach and damage", () => {
    const { match, secret } = playing();
    match.monsters.boss = newMonster("boss", 10, 12.5);
    monsterAttack(match, secret, "a", "boss", "b", at(10, 14), T);
    expect(secret.hp.b).toBe(100 - MONSTER_STATS.boss.damage);
    expect(match.monsters.boss.attackReadyAt).toBe(T + MONSTER_STATS.boss.intervalMs);
  });
});

describe("reachExit", () => {
  const exits = [{ x: 0, z: 10 }];

  it("lets an active player standing at an exit escape, once", () => {
    const { match, secret, poses } = playing();
    match.objectives.stage = "exit";
    reachExit(match, secret, "a", poses.a, exits, T);
    expect(match.escaped).toEqual(["a"]);
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("unavailable");
    expect(() => reachExit(match, secret, "b", poses.b, exits, T)).toThrow("not_at_exit");
  });

  it("ends the traitor's possession if the traitor escapes", () => {
    const { match, secret } = possessing();
    match.objectives.stage = "exit";
    reachExit(match, secret, "c", at(1, 10), exits, T + 1);
    expect(match.escaped).toEqual(["c"]);
    expect(secret.possession).toBeNull();
  });

  it("keeps the exit shut until the last stage, and bound players inside", () => {
    const { match, secret, poses } = playing();
    expect(() => reachExit(match, secret, "b", poses.b, exits, T)).toThrow("not_at_exit");
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("exit_locked");
    match.objectives.stage = "exit";
    match.bound.a = T + 1;
    expect(() => reachExit(match, secret, "a", poses.a, exits, T)).toThrow("bound");
    expect(match.escaped).toEqual([]);
  });
});
