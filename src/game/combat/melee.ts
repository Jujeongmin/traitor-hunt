import type { Weapon } from "./classes";
import { RANGE_SLACK } from "../world/types";
import type { Pose, Vec2 } from "../world/types";

// Poses reach the server a little late, so a swing's arc is judged this much wider there.
export const ARC_SLACK = (20 * Math.PI) / 180;
// A shield covers this much of what is in front of you.
export const BLOCK_ARC = (150 * Math.PI) / 180;

// Whether a point lies within half of arc either side of where the body faces (yaw 0 faces -z).
export function facing(pose: Pose, point: Vec2, arc: number): boolean {
  const dx = point.x - pose.x;
  const dz = point.z - pose.z;
  if (dx === 0 && dz === 0) return true;
  const toward = Math.atan2(-dx, -dz);
  let d = (toward - pose.yaw) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d) <= arc / 2;
}

// Whether a swing from pose lands on a target: close enough and inside the weapon's arc. The server
// adds slack for lag; the client asks without it.
export function inStrikeReach(pose: Pose, target: Vec2, weapon: Weapon, slack = false): boolean {
  const reach = weapon.reach + (slack ? RANGE_SLACK : 0);
  const arc = weapon.arc + (slack ? ARC_SLACK * 2 : 0);
  return Math.hypot(target.x - pose.x, target.z - pose.z) <= reach && facing(pose, target, arc);
}
