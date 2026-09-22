import type { PlayerClass } from "./classes";
import { inStrikeReach } from "./melee";
import type { Pose, Vec2 } from "../world/types";

// What a skill needs to know of a monster.
interface Target extends Vec2 { alive: boolean }

// Each class has three skills, on keys 1, 2 and 3, each on its own cooldown; the second and third
// open up at higher levels. They are what make the six play differently.
export interface Skill {
  name: string;
  // What the skill does, in a line.
  blurb: string;
  // The level it opens up at.
  level: number;
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

export const SKILL_SLOTS = 3;
// Keys 1, 2 and 3.
export const SKILL_KEYS = ["Digit1", "Digit2", "Digit3"] as const;

const deg = (d: number) => (d * Math.PI) / 180;
const base = { stunMs: 0, maxTargets: 0, heal: 0 };
const all = deg(360);

export const SKILLS: Record<PlayerClass, readonly Skill[]> = {
  warrior: [
    { ...base, name: "회전베기", blurb: "한 바퀴 돌며 주변 몬스터를 모두 벤다", level: 1, cooldownMs: 8000, damage: 55, reach: 2.8, arc: all },
    {
      ...base, name: "돌진 베기", blurb: "앞을 크게 베어 잠시 넘어뜨린다", level: 10,
      cooldownMs: 9000, damage: 75, reach: 4, arc: deg(70), stunMs: 800,
    },
    {
      ...base, name: "대지 강타", blurb: "땅을 내리쳐 주변을 모두 기절시킨다", level: 20,
      cooldownMs: 20000, damage: 110, reach: 4.5, arc: all, stunMs: 1500,
    },
  ],
  ranger: [
    { ...base, name: "관통 화살", blurb: "앞으로 곧게 날아가 줄지어 선 몬스터를 모두 꿰뚫는다", level: 1, cooldownMs: 8000, damage: 45, reach: 16, arc: deg(12) },
    {
      ...base, name: "조준 사격", blurb: "하나를 노려 크게 맞힌다", level: 10,
      cooldownMs: 6000, damage: 80, reach: 14, arc: deg(30), maxTargets: 1,
    },
    { ...base, name: "화살비", blurb: "주변에 화살을 쏟아붓는다", level: 20, cooldownMs: 18000, damage: 90, reach: 7, arc: all },
  ],
  wizard: [
    { ...base, name: "화염 폭발", blurb: "주변을 불꽃으로 덮어 몬스터를 태운다", level: 1, cooldownMs: 10000, damage: 50, reach: 4.5, arc: all },
    {
      ...base, name: "얼음 창", blurb: "하나를 꿰뚫고 얼려 움직이지 못하게 한다", level: 10,
      cooldownMs: 8000, damage: 60, reach: 11, arc: deg(20), maxTargets: 1, stunMs: 2000,
    },
    { ...base, name: "운석 낙하", blurb: "하늘에서 불덩이를 떨어뜨려 주변을 태운다", level: 20, cooldownMs: 22000, damage: 140, reach: 6, arc: all },
  ],
  cleric: [
    { ...base, name: "치유의 빛", blurb: "자신과 가까운 동료의 체력을 회복한다", level: 1, cooldownMs: 12000, damage: 0, reach: 6, arc: all, heal: 35 },
    {
      ...base, name: "신성한 일격", blurb: "지팡이에 빛을 실어 앞을 치고 기절시킨다", level: 10,
      cooldownMs: 8000, damage: 60, reach: 3, arc: deg(110), stunMs: 1000,
    },
    {
      ...base, name: "축복", blurb: "주변 몬스터를 태우고 동료를 크게 회복한다", level: 20,
      cooldownMs: 25000, damage: 40, reach: 8, arc: all, heal: 90,
    },
  ],
  rogue: [
    { ...base, name: "그림자 일격", blurb: "앞의 몬스터 하나를 크게 찌른다", level: 1, cooldownMs: 7000, damage: 90, reach: 3, arc: deg(90), maxTargets: 1 },
    { ...base, name: "칼날 부채", blurb: "앞으로 단검을 흩뿌린다", level: 10, cooldownMs: 6000, damage: 55, reach: 5, arc: deg(100) },
    { ...base, name: "그림자 난무", blurb: "주변을 휘저으며 모두 벤다", level: 20, cooldownMs: 18000, damage: 130, reach: 3.5, arc: all },
  ],
  monk: [
    { ...base, name: "기절 연타", blurb: "앞의 몬스터를 두들겨 잠시 기절시킨다", level: 1, cooldownMs: 10000, damage: 20, reach: 2.6, arc: deg(120), stunMs: 2500 },
    { ...base, name: "회오리 발차기", blurb: "돌며 차서 주변을 모두 때린다", level: 10, cooldownMs: 7000, damage: 50, reach: 2.8, arc: all },
    {
      ...base, name: "백열권", blurb: "하나에게 온 힘을 실은 주먹을 꽂는다", level: 20,
      cooldownMs: 18000, damage: 160, reach: 3, arc: deg(90), maxTargets: 1, stunMs: 2000,
    },
  ],
};

// A skill slot number from a client: 0, 1 or 2.
export function readSlot(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SKILL_SLOTS ? value : null;
}

// The living monsters a skill used from pose lands on, nearest first. The server passes slack for lag.
export function skillTargets(
  pose: Pose, monsters: Record<string, Target>, skill: Skill, slack = false,
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
