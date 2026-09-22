import { gearStats, type Gear, type Plus } from "../account/items";
import { levelOf } from "../account/level";
import { damageAt, maxHpAt } from "../world/monsters";
import { WEAPONS, type PlayerClass } from "./classes";
import { JOBS, type JobId } from "./jobs";

// What gear and an advanced class add to a fight: a share more damage, more health, a share of
// every blow stopped, and a share more healing.
export interface FightBonus { power: number; hp: number; guard: number; heal: number }

// The stats a character fights with at its level, in its gear and advanced class.
export function fightStats(c: { xp: number; gear: Gear; job: JobId | null; plus?: Plus }): { maxHp: number; gear: FightBonus } {
  return fightStatsAt(levelOf(c.xp).level, c.gear, c.job, c.plus);
}

export function fightStatsAt(level: number, gear: Gear, job: JobId | null, plus: Plus = {}): { maxHp: number; gear: FightBonus } {
  const worn = gearStats(gear, plus);
  const advanced = job ? JOBS[job] : null;
  const bonus = {
    power: worn.power + (advanced?.power ?? 0), hp: worn.hp + (advanced?.hp ?? 0), guard: worn.guard + (advanced?.guard ?? 0),
    heal: advanced?.heal ?? 0,
  };
  return { maxHp: maxHpAt(level) + bonus.hp, gear: bonus };
}

// 전투력: one number for how strong a character is, from how fast it deals damage with its class's
// weapon (at its level, gear and advanced class) and how much it takes to fell it (health, over the
// share of each blow that gets through). Healing adds to both halves.
export function combatPower(c: { xp: number; playerClass: PlayerClass; gear: Gear; job: JobId | null; plus?: Plus }): number {
  return combatPowerAt(levelOf(c.xp).level, c.playerClass, c.gear, c.job, c.plus);
}

export function combatPowerAt(level: number, playerClass: PlayerClass, gear: Gear, job: JobId | null, plus: Plus = {}): number {
  const { maxHp, gear: bonus } = fightStatsAt(level, gear, job, plus);
  const weapon = WEAPONS[playerClass];
  const perSecond = damageAt(weapon.damage, level, bonus.power) / (weapon.intervalMs / 1000);
  const toFell = maxHp / (1 - Math.min(0.8, bonus.guard));
  return Math.round((perSecond * 10 + toFell * 2) * (1 + bonus.heal * 0.2));
}
