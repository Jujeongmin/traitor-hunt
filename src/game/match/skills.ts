import type { PlayerClass } from "./classes";
import { inStrikeReach } from "./melee";
import type { MonsterState, Pose } from "./types";

// Each class has one skill on a cooldown: what makes the two play differently. The striker spins
// through a crowd; the guardian slams the shield into what is in front and stuns it.
export interface Skill {
  name: string;
  // What the skill button says it does.
  blurb: string;
  cooldownMs: number;
  damage: number;
  reach: number;
  // Radians, total; a full turn hits all round.
  arc: number;
  // How long a monster it hits stands dazed, unable to move or attack.
  stunMs: number;
}

export const SKILLS: Record<PlayerClass, Skill> = {
  striker: {
    name: "회전베기", blurb: "한 바퀴 돌며 주변 몬스터를 모두 벤다",
    cooldownMs: 8000, damage: 55, reach: 2.8, arc: 2 * Math.PI, stunMs: 0,
  },
  guardian: {
    name: "방패 강타", blurb: "앞의 몬스터를 방패로 쳐서 잠시 기절시킨다",
    cooldownMs: 10000, damage: 15, reach: 2.6, arc: (120 * Math.PI) / 180, stunMs: 2500,
  },
};

// The living monsters a skill used from pose lands on. The server passes slack for lag.
export function skillTargets(
  pose: Pose, monsters: Record<string, MonsterState>, skill: Skill, slack = false,
): string[] {
  const reachOf = { name: skill.name, damage: skill.damage, intervalMs: 0, reach: skill.reach, arc: skill.arc, block: 0 };
  return Object.entries(monsters)
    .filter(([, m]) => m.alive && inStrikeReach(pose, m, reachOf, slack))
    .map(([id]) => id);
}
