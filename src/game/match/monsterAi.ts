import { stepAround, type SolidTest } from "../rules/movement";
import { MONSTER_STATS } from "./constants";
import type { MonsterPoseUpdate } from "./damage";
import { isActive } from "./lifecycle";
import type { Poses, PublicMatch } from "./types";
import { distance, reaches } from "./view";

export const ZOMBIE_SPEED = MONSTER_STATS.zombie.speed;
export const ZOMBIE_AGGRO_RANGE = MONSTER_STATS.zombie.aggro;

export interface MonsterOrder { monsterId: string; target: string }
export interface AiStep { updates: MonsterPoseUpdate[]; attacks: MonsterOrder[] }

export function stepMonsterAi(
  match: PublicMatch, poses: Poses, isSolid: SolidTest, dt: number, now: number, skip: (monsterId: string) => boolean,
): AiStep {
  const updates: MonsterPoseUpdate[] = [];
  const attacks: MonsterOrder[] = [];
  for (const [id, monster] of Object.entries(match.monsters)) {
    if (!monster.alive || monster.possessed || now < monster.stunnedUntil || skip(id)) continue;
    const stats = MONSTER_STATS[monster.kind];

    let target: { account: string; x: number; z: number; d: number } | null = null;
    for (const account of match.players) {
      const pose = poses[account];
      if (!pose || !isActive(match, account)) continue;
      // Someone the monster cannot hit is not worth walking to.
      if (!reaches(monster.kind, pose.y)) continue;
      const d = distance(pose, monster);
      if (d <= stats.aggro && (!target || d < target.d)) target = { account, x: pose.x, z: pose.z, d };
    }
    if (!target) continue;

    const yaw = Math.atan2(-(target.x - monster.x), -(target.z - monster.z));
    if (target.d > stats.range * 0.8) {
      const moved = stepAround({ x: monster.x, z: monster.z, yaw }, yaw, dt, isSolid, stats.speed);
      updates.push({ id, x: moved.x, z: moved.z, yaw });
    } else {
      updates.push({ id, x: monster.x, z: monster.z, yaw });
      if (now >= monster.attackReadyAt) attacks.push({ monsterId: id, target: target.account });
    }
  }
  return { updates, attacks };
}
