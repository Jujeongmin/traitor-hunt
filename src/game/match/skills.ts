import type { PlayerClass } from "./classes";
import { inStrikeReach } from "./melee";
import type { MonsterState, Pose, Vec2 } from "./types";

// Each class has one skill on a cooldown, on key 1: what makes the six play differently.
export interface Skill {
  name: string;
  // What the skill does, in a line.
  blurb: string;
  cooldownMs: number;
  damage: number;
  reach: number;
  // Radians, total; a full turn hits all round.
  arc: number;
  // How long a monster it hits stands dazed, unable to move or attack.
  stunMs: number;
  // Only the nearest this many monsters are hit; 0 means every one in reach.
  maxTargets: number;
  // Health given back to you and every living player within reach.
  heal: number;
}

const deg = (d: number) => (d * Math.PI) / 180;
const base = { stunMs: 0, maxTargets: 0, heal: 0 };

export const SKILLS: Record<PlayerClass, Skill> = {
  warrior: {
    ...base, name: "회전베기", blurb: "한 바퀴 돌며 주변 몬스터를 모두 벤다",
    cooldownMs: 8000, damage: 55, reach: 2.8, arc: deg(360),
  },
  ranger: {
    ...base, name: "관통 화살", blurb: "앞으로 곧게 날아가 줄지어 선 몬스터를 모두 꿰뚫는다",
    cooldownMs: 8000, damage: 45, reach: 16, arc: deg(12),
  },
  wizard: {
    ...base, name: "화염 폭발", blurb: "주변을 불꽃으로 덮어 몬스터를 태운다",
    cooldownMs: 10000, damage: 50, reach: 4.5, arc: deg(360),
  },
  cleric: {
    ...base, name: "치유의 빛", blurb: "자신과 가까운 동료의 체력을 회복한다",
    cooldownMs: 12000, damage: 0, reach: 6, arc: deg(360), heal: 35,
  },
  rogue: {
    ...base, name: "그림자 일격", blurb: "앞의 몬스터 하나를 크게 찌른다",
    cooldownMs: 7000, damage: 90, reach: 3, arc: deg(90), maxTargets: 1,
  },
  monk: {
    ...base, name: "기절 연타", blurb: "앞의 몬스터를 두들겨 잠시 기절시킨다",
    cooldownMs: 10000, damage: 20, reach: 2.6, arc: deg(120), stunMs: 2500,
  },
};

// The living monsters a skill used from pose lands on, nearest first. The server passes slack for lag.
export function skillTargets(
  pose: Pose, monsters: Record<string, MonsterState>, skill: Skill, slack = false,
): string[] {
  if (skill.damage <= 0 && skill.stunMs <= 0) return [];
  const reachOf = {
    name: skill.name, damage: skill.damage, intervalMs: 0, reach: skill.reach, arc: skill.arc, block: 0, ranged: false,
  };
  const hit = Object.entries(monsters)
    .filter(([, m]) => m.alive && inStrikeReach(pose, m, reachOf, slack))
    .sort(([, a], [, b]) => dist(pose, a) - dist(pose, b))
    .map(([id]) => id);
  return skill.maxTargets > 0 ? hit.slice(0, skill.maxTargets) : hit;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
