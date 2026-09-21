import { describe, expect, it } from "vitest";
import { CHASE, chaseCamera } from "../../src/game/rules/chaseCamera";

const open = () => false;
const pose = { x: 10, z: 10, y: 0 };

describe("chaseCamera", () => {
  it("sits behind and to the right of the player, looking the same way", () => {
    // yaw 0 looks down -z, so behind is +z and right is +x.
    const cam = chaseCamera(pose, 0, 0, open, 4);
    expect(cam.z).toBeCloseTo(10 + CHASE.distance);
    expect(cam.x).toBeCloseTo(10 + CHASE.shoulder);
    expect(cam.y).toBeCloseTo(CHASE.height);
    expect(cam.distance).toBeCloseTo(CHASE.distance);
  });

  it("turns around the player with the yaw", () => {
    // yaw π/2 looks down -x, so behind is +x.
    const cam = chaseCamera(pose, Math.PI / 2, 0, open, 4);
    expect(cam.x).toBeCloseTo(10 + CHASE.distance);
  });

  it("rises when you look down and drops when you look up", () => {
    const down = chaseCamera(pose, 0, -0.5, open, 4);
    const up = chaseCamera(pose, 0, 0.5, open, 4);
    expect(down.y).toBeGreaterThan(CHASE.height);
    expect(up.y).toBeLessThan(CHASE.height);
  });

  it("follows a jump or a crate", () => {
    expect(chaseCamera({ ...pose, y: 1 }, 0, 0, open, 4).y).toBeCloseTo(CHASE.height + 1);
  });

  it("pulls in rather than passing through a wall behind the player", () => {
    const wallBehind = (_x: number, z: number) => z > 11.5;
    const cam = chaseCamera(pose, 0, 0, wallBehind, 4);
    expect(cam.z).toBeLessThan(11.5);
    expect(cam.distance).toBeLessThan(CHASE.distance);
    expect(cam.distance).toBeGreaterThanOrEqual(CHASE.minDistance);
  });
});
