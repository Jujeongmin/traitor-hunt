import type { PlayerClass } from "./classes";

// Advancement (전직): from ADVANCE_LEVEL a character picks one of two paths of its class, for good.
// A path adds to every fight what gear would (damage, health, a share of each blow stopped), and a
// cleric's healer path heals more. Its name shows before the character's name.

export const ADVANCE_LEVEL = 30;

export type JobId =
  | "berserker" | "guardian"
  | "sniper" | "tracker"
  | "elementalist" | "warder"
  | "high_priest" | "paladin"
  | "assassin" | "scout"
  | "fist_master" | "iron_monk";

export interface Job {
  name: string;
  blurb: string;
  playerClass: PlayerClass;
  power: number;
  hp: number;
  guard: number;
  // Heals give back this much more.
  heal: number;
}

const none = { power: 0, hp: 0, guard: 0, heal: 0 };

export const JOBS: Record<JobId, Job> = {
  berserker: { ...none, name: "버서커", blurb: "공격력 +20%", playerClass: "warrior", power: 0.2 },
  guardian: { ...none, name: "수호기사", blurb: "체력 +80, 받는 피해 -10%", playerClass: "warrior", hp: 80, guard: 0.1 },
  sniper: { ...none, name: "저격수", blurb: "공격력 +20%", playerClass: "ranger", power: 0.2 },
  tracker: { ...none, name: "숲의 추적자", blurb: "공격력 +10%, 체력 +40", playerClass: "ranger", power: 0.1, hp: 40 },
  elementalist: { ...none, name: "원소술사", blurb: "공격력 +25%", playerClass: "wizard", power: 0.25 },
  warder: { ...none, name: "결계술사", blurb: "체력 +60, 받는 피해 -10%", playerClass: "wizard", hp: 60, guard: 0.1 },
  high_priest: { ...none, name: "대사제", blurb: "회복량 +50%, 체력 +40", playerClass: "cleric", hp: 40, heal: 0.5 },
  paladin: { ...none, name: "성기사", blurb: "공격력 +15%, 체력 +60", playerClass: "cleric", power: 0.15, hp: 60 },
  assassin: { ...none, name: "암살자", blurb: "공격력 +25%", playerClass: "rogue", power: 0.25 },
  scout: { ...none, name: "척후병", blurb: "공격력 +10%, 체력 +40", playerClass: "rogue", power: 0.1, hp: 40 },
  fist_master: { ...none, name: "권성", blurb: "공격력 +20%", playerClass: "monk", power: 0.2 },
  iron_monk: { ...none, name: "철벽 수도승", blurb: "체력 +80, 받는 피해 -10%", playerClass: "monk", hp: 80, guard: 0.1 },
};

export function readJob(value: unknown): JobId | null {
  return typeof value === "string" && value in JOBS ? (value as JobId) : null;
}

// The two paths a class can take.
export function jobsOf(playerClass: PlayerClass): JobId[] {
  return (Object.keys(JOBS) as JobId[]).filter((id) => JOBS[id].playerClass === playerClass);
}
