import type { MonsterKind } from "../world/types";

// Bodies do not walk through each other: a step that would end inside another body is refused,
// unless it moves away from that body (so two that already overlap can always part).

export interface Body { x: number; z: number; r: number }

// Footprint radii in metres.
export const PLAYER_BODY = 0.35;
export const MONSTER_BODY: Record<MonsterKind, number> = { zombie: 0.4, boss: 0.9 };

// Whether stepping from `from` to (x, z) would push into one of the bodies. Each body's r is the
// distance the two centres must keep (both radii added).
export function crowdBlocks(bodies: readonly Body[], from: { x: number; z: number }, x: number, z: number): boolean {
  for (const b of bodies) {
    const next = Math.hypot(x - b.x, z - b.z);
    if (next >= b.r) continue;
    if (next < Math.hypot(from.x - b.x, from.z - b.z) - 1e-6) return true;
  }
  return false;
}
