import { describe, expect, it } from "vitest";
import { PITCH_LIMIT, PLAYER_RADIUS, WALK_SPEED, applyLook, stepPlayer, stepAround } from "../src/game/rules/movement";
import { GROUNDED, stepJump, type Airborne } from "../src/game/rules/movement";

const open = () => false;
const wallWest = (x: number) => x < 0;

describe("stepPlayer", () => {
  it("walks forward along -z at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(next.x).toBeCloseTo(10);
    expect(next.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("walks forward along -x at yaw +90deg and strafes right along -z", () => {
    const fwd = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, open);
    expect(fwd.x).toBeCloseTo(10 - WALK_SPEED * 0.1);
    const right = stepPlayer({ x: 10, z: 10, yaw: Math.PI / 2 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(right.z).toBeCloseTo(10 - WALK_SPEED * 0.1);
  });

  it("strafes right along +x at yaw 0", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 0, strafe: 1 }, 0.1, open);
    expect(next.x).toBeCloseTo(10 + WALK_SPEED * 0.1);
  });

  it("does not move faster diagonally", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 1 }, 0.1, open);
    expect(Math.hypot(next.x - 10, next.z - 10)).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("caps a long frame so a hitch cannot tunnel through a wall", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 5, open);
    expect(10 - next.z).toBeCloseTo(WALK_SPEED * 0.1);
  });

  it("stops at a wall without entering it", () => {
    const next = stepPlayer({ x: 0.5, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 0 }, 0.1, wallWest);
    expect(next.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(next.x).toBeLessThan(0.5);
  });

  it("slides along a wall", () => {
    const next = stepPlayer({ x: PLAYER_RADIUS, z: 10, yaw: Math.PI / 2 }, { forward: 1, strafe: 1 }, 0.1, wallWest);
    expect(next.x).toBeCloseTo(PLAYER_RADIUS);
    expect(next.z).toBeLessThan(10 - 0.2);
  });

  it("moves at a custom speed when one is given", () => {
    const next = stepPlayer({ x: 10, z: 10, yaw: 0 }, { forward: 1, strafe: 0 }, 0.1, open, 2);
    expect(10 - next.z).toBeCloseTo(0.2);
  });

  it("stands still with no input", () => {
    const pose = { x: 1, z: 2, yaw: 3 };
    expect(stepPlayer(pose, { forward: 0, strafe: 0 }, 0.1, open)).toEqual(pose);
  });
});

describe("applyLook", () => {
  it("turns right (yaw decreases) when the mouse moves right", () => {
    expect(applyLook(0, 0, 100, 0, 0.002).yaw).toBeCloseTo(-0.2);
  });

  it("clamps pitch so the camera never flips", () => {
    expect(applyLook(0, 0, 0, -100000, 0.002).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(applyLook(0, 0, 0, 100000, 0.002).pitch).toBeCloseTo(-PITCH_LIMIT);
  });
});

describe("stepJump", () => {
  const run = (state: Airborne, jump: boolean, seconds: number, dt = 1 / 60) => {
    let s = state;
    let peak = s.y;
    for (let t = 0; t < seconds; t += dt) {
      s = stepJump(s, jump && t === 0, dt);
      peak = Math.max(peak, s.y);
    }
    return { s, peak };
  };

  it("stays on the ground without a jump", () => {
    expect(stepJump(GROUNDED, false, 1 / 60)).toEqual(GROUNDED);
  });

  it("rises about 0.6 m and lands within about 0.65 s", () => {
    const { s, peak } = run(GROUNDED, true, 0.7);
    expect(peak).toBeGreaterThan(0.55);
    expect(peak).toBeLessThan(0.7);
    expect(s).toEqual(GROUNDED);
  });

  it("cannot jump again in the air", () => {
    const up = stepJump(GROUNDED, true, 1 / 60);
    const again = stepJump(up, true, 1 / 60);
    expect(again.vy).toBeLessThan(up.vy);
  });
});

describe("stepAround", () => {
  // A round stone of radius 0.6 at the origin.
  const stone = (x: number, z: number) => Math.hypot(x, z) < 0.6;

  it("walks straight when nothing is in the way", () => {
    const next = stepAround({ x: 0, z: 5, yaw: 0 }, 0, 0.1, stone, 4);
    expect(next.z).toBeCloseTo(4.6);
    expect(next.x).toBeCloseTo(0);
  });

  it("slides round a stone that stands dead ahead instead of pushing into it", () => {
    // Heading -z straight at the stone, already touching it.
    let pose = { x: 0, z: 1.05, yaw: 0 };
    for (let i = 0; i < 40; i++) pose = stepAround(pose, 0, 0.1, stone, 4);
    expect(pose.z).toBeLessThan(-1);
  });
});
