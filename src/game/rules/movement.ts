export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 4;
export const MAX_STEP_SECONDS = 0.1;
export const EYE_HEIGHT = 1.6;
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

export interface MoveInput { forward: number; strafe: number }
export interface PlayerPose { x: number; z: number; yaw: number }
export type SolidTest = (x: number, z: number) => boolean;

export function stepPlayer(
  pose: PlayerPose, input: MoveInput, dt: number, isSolid: SolidTest, speed: number = WALK_SPEED,
): PlayerPose {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  let mx = -sin * input.forward + cos * input.strafe;
  let mz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(mx, mz);
  if (len === 0 || step === 0) return pose;

  const scale = (speed * step * Math.min(1, len)) / len;
  mx *= scale;
  mz *= scale;

  const x = slide(pose.x, mx, (nx) => blocked(nx, pose.z, isSolid));
  const z = slide(pose.z, mz, (nz) => blocked(x, nz, isSolid));
  return { x, z, yaw: pose.yaw };
}

export function applyLook(yaw: number, pitch: number, dx: number, dy: number, sensitivity: number) {
  const nextPitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch - dy * sensitivity));
  return { yaw: yaw - dx * sensitivity, pitch: nextPitch };
}

function blocked(x: number, z: number, isSolid: SolidTest): boolean {
  const r = PLAYER_RADIUS;
  return isSolid(x - r, z - r) || isSolid(x + r, z - r) || isSolid(x - r, z + r) || isSolid(x + r, z + r);
}

function slide(from: number, delta: number, isBlocked: (to: number) => boolean): number {
  if (delta === 0) return from;
  let d = delta;
  for (let i = 0; i < 5; i++) {
    if (!isBlocked(from + d)) return from + d;
    d /= 2;
  }
  return from;
}

// Jumping lifts the body and the camera onto the crates and blocks in the map. The height matters:
// monsters only reach so high (see view.ts), and the server checks it against the map.
export const JUMP_SPEED = 4.2;
export const GRAVITY = 14;

export interface Airborne {
  // Height of the feet above the floor.
  y: number;
  vy: number;
}

export const GROUNDED: Airborne = { y: 0, vy: 0 };

// How far a jump lifts your feet above what you stand on (its peak is about 0.63 m).
export const MAX_JUMP_RISE = 0.7;
// Anything a client reports as a feet height, clamped to the highest platform plus a jump.
export const MAX_JUMP_Y = 1.7;
export function readJumpY(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_JUMP_Y, Math.max(0, value)) : 0;
}

// Starts a jump from whatever you stand on when asked, then falls under gravity until it meets the
// ground again. ground is the height under you now (the floor, or a platform's top).
export function stepJump(state: Airborne, jump: boolean, dt: number, ground = 0): Airborne {
  const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
  const onGround = state.y <= ground + 1e-3;
  const vy = jump && onGround ? JUMP_SPEED : state.vy;
  const landed = { y: ground, vy: 0 };
  if (onGround && vy <= 0) return ground === 0 ? GROUNDED : landed;
  const next = { y: Math.max(state.y, ground) + vy * step, vy: vy - GRAVITY * step };
  return next.y <= ground ? (ground === 0 ? GROUNDED : landed) : next;
}
