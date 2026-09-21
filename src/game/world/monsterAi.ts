import { crowdBlocks, PLAYER_BODY, type Body } from "../rules/crowd";
import { solidWith, type LevelLayout } from "../rules/levelLayout";
import { MAX_STEP_SECONDS, stepAround, type SolidTest } from "../rules/movement";
import { MONSTERS, respawned, type MonsterState } from "./monsters";

// A player as the monsters see them.
export interface Prey { account: string; x: number; z: number }

export interface MonsterHit { monsterId: string; account: string; damage: number }

// A monster this far from where it started gives up the chase, walks home and heals.
export const LEASH = 20;

// One step of every monster in a room: the fallen come back when their time is up, the rest chase
// the nearest player they can see, walk round each other, the players and the forest, and swing
// when close enough. Returns the blows landed; the caller takes them off the players.
export function stepMonsters(
  monsters: Record<string, MonsterState>, prey: readonly Prey[], layout: LevelLayout, dt: number, now: number,
): MonsterHit[] {
  const hits: MonsterHit[] = [];
  const walls: SolidTest = solidWith(layout, 0);
  for (const [id, m] of Object.entries(monsters)) {
    const spec = MONSTERS[m.type];
    if (!m.alive) {
      if (now >= m.respawnAt) monsters[id] = respawned(m);
      continue;
    }
    if (now < m.stunnedUntil) continue;

    const fromHome = Math.hypot(m.x - m.homeX, m.z - m.homeZ);
    let target: { prey: Prey; d: number } | null = null;
    if (fromHome <= LEASH) {
      for (const p of prey) {
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d <= spec.aggro && (!target || d < target.d)) target = { prey: p, d };
      }
    }
    const goal = target ? target.prey : { x: m.homeX, z: m.homeZ };
    const d = Math.hypot(goal.x - m.x, goal.z - m.z);
    const yaw = Math.atan2(-(goal.x - m.x), -(goal.z - m.z));

    if (target && d <= spec.range) {
      m.yaw = yaw;
      if (now >= m.attackReadyAt) {
        m.attackReadyAt = now + spec.attackMs;
        hits.push({ monsterId: id, account: target.prey.account, damage: spec.damage });
      }
      continue;
    }
    if (!target && d < 0.5) {
      // Home: whole again after a lost chase.
      m.hp = spec.hp;
      continue;
    }

    const bodies: Body[] = [];
    for (const [otherId, other] of Object.entries(monsters)) {
      if (otherId !== id && other.alive) bodies.push({ x: other.x, z: other.z, r: spec.body + MONSTERS[other.type].body });
    }
    for (const p of prey) bodies.push({ x: p.x, z: p.z, r: spec.body + PLAYER_BODY });
    // The movement rules take at most MAX_STEP_SECONDS at a time.
    let left = dt;
    while (left > 1e-6) {
      const step = Math.min(left, MAX_STEP_SECONDS);
      left -= step;
      const blocked: SolidTest = (x, z) => walls(x, z) || crowdBlocks(bodies, m, x, z);
      const moved = stepAround({ x: m.x, z: m.z, yaw }, yaw, step, blocked, spec.speed);
      m.x = moved.x;
      m.z = moved.z;
    }
    m.yaw = yaw;
  }
  return hits;
}
