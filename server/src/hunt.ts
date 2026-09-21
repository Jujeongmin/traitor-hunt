import { gearStats, type Gear } from "../../src/game/account/items";
import { JOBS, type JobId } from "../../src/game/combat/jobs";
import { levelOf } from "../../src/game/account/level";
import { WEAPONS, readClass, type PlayerClass } from "../../src/game/combat/classes";
import { BLOCK_ARC, facing, inStrikeReach } from "../../src/game/combat/melee";
import { SKILLS, readSlot, skillTargets } from "../../src/game/combat/skills";
import { stepMonsters, type Prey } from "../../src/game/world/monsterAi";
import {
  MONSTERS, ZONE_BOSS, ZONE_MONSTERS, damageAt, maxHpAt, readMonsterType, spawnMonsters, type MonsterState,
  type MonsterType,
} from "../../src/game/world/monsters";
import { RANGE_SLACK, RuleViolation, isPose, type Pose } from "../../src/game/world/types";
import { zoneLayout, type ZoneId } from "../../src/game/world/zones";

// Hunting, all decided here: the monsters of a channel live in its room state and move on every room
// tick; your health, and when your next attack and skill are allowed, live in your room user state.

// Clients send an attack as soon as their own clock allows; this much earlier still counts (jitter).
const COOLDOWN_GRACE = 0.8;
// Out of a fight this long, you heal REGEN_SHARE of your health every REGEN_MS.
const CALM_MS = 5_000;
const REGEN_MS = 2_000;
const REGEN_SHARE = 0.05;
// A room tick after a long pause moves monsters at most this far in time.
const MAX_TICK_MS = 1_000;

export function hasMonsters(zone: ZoneId): boolean {
  return ZONE_MONSTERS[zone].length > 0 || !!ZONE_BOSS[zone];
}

// One writer at a time for a room's monsters and players' health.
export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  return $lock(`room-${roomId}`, fn);
}

// What your room user state says about you in a fight.
interface Fighter {
  pose: Pose | null;
  playerClass: PlayerClass;
  level: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  // What the worn gear and the advanced class add.
  gear: FightBonus;
}

// What gear and an advanced class add to a fight: a share more damage, more health, a share of
// every blow stopped, and a share more healing.
export interface FightBonus { power: number; hp: number; guard: number; heal: number }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function readFighter(state: Record<string, any>): Fighter {
  const level = typeof state.look?.level === "number" ? state.look.level : 1;
  const gear = {
    power: num(state.gear?.power), hp: num(state.gear?.hp), guard: Math.min(0.8, num(state.gear?.guard)), heal: num(state.gear?.heal),
  };
  const maxHp = typeof state.maxHp === "number" ? state.maxHp : maxHpAt(level) + gear.hp;
  return {
    gear,
    pose: isPose(state.pose) ? state.pose : null,
    playerClass: readClass(state.look?.playerClass) ?? "warrior",
    level,
    hp: typeof state.hp === "number" ? state.hp : maxHp,
    maxHp,
    dead: state.dead === true,
  };
}

// The room's monsters, spawned the first time anyone asks.
async function readMonsters(zone: ZoneId): Promise<Record<string, MonsterState>> {
  const stored = (await $room.getRoomState(["monsters"])).monsters;
  if (!stored || typeof stored !== "object") return spawnMonsters(zone);
  const out: Record<string, MonsterState> = {};
  for (const [id, m] of Object.entries(stored as Record<string, MonsterState>)) {
    if (m && readMonsterType(m.type)) out[id] = m;
  }
  return Object.keys(out).length > 0 ? out : spawnMonsters(zone);
}

const round = (n: number) => Math.round(n * 100) / 100;

function tidy(monsters: Record<string, MonsterState>): Record<string, MonsterState> {
  for (const m of Object.values(monsters)) {
    m.x = round(m.x);
    m.z = round(m.z);
    m.yaw = round(m.yaw);
  }
  return monsters;
}

async function writeMonsters(monsters: Record<string, MonsterState>): Promise<void> {
  await $room.updateRoomState({ monsters: tidy(monsters) }, { returnState: false });
}

// The stats a character fights with at its level, in its gear and advanced class, for the room user
// state on arrival, level up, a change of gear or advancement.
export function fightStats(c: { xp: number; gear: Gear; job: JobId | null }): { maxHp: number; gear: FightBonus } {
  const worn = gearStats(c.gear);
  const job = c.job ? JOBS[c.job] : null;
  const bonus = {
    power: worn.power + (job?.power ?? 0), hp: worn.hp + (job?.hp ?? 0), guard: worn.guard + (job?.guard ?? 0), heal: job?.heal ?? 0,
  };
  return { maxHp: maxHpAt(levelOf(c.xp).level) + bonus.hp, gear: bonus };
}

// One room tick: monsters move and swing, blows land on players (a raised guard facing the monster
// stops part of it), and players out of a fight heal a little.
export async function tickRoom(zone: ZoneId, deltaMs: number, now: number): Promise<void> {
  const state = await $room.getRoomState(["monsters", "regenAt"]);
  const accounts: string[] = state.$users;
  if (accounts.length === 0) return;
  const monsters = await readMonsters(zone);
  const users: (Record<string, any> & { account: string })[] = await $room.getUserStates(
    accounts, ["pose", "look", "hp", "maxHp", "dead", "hitAt"],
  );
  const fighters = new Map(users.map((u) => [u.account, { ...readFighter(u), hitAt: typeof u.hitAt === "number" ? u.hitAt : 0 }]));
  const prey: Prey[] = [];
  for (const [account, f] of fighters) if (f.pose && !f.dead) prey.push({ account, x: f.pose.x, z: f.pose.z });

  const hits = stepMonsters(monsters, prey, zoneLayout(zone), Math.min(deltaMs, MAX_TICK_MS) / 1000, now);
  const hurt = new Set<string>();
  for (const hit of hits) {
    const f = fighters.get(hit.account);
    const m = monsters[hit.monsterId];
    if (!f || f.dead || !m) continue;
    const guarded = f.pose?.block === true && facing(f.pose, m, BLOCK_ARC);
    const shield = guarded ? 1 - WEAPONS[f.playerClass].block : 1;
    const damage = Math.max(1, Math.round(hit.damage * shield * (1 - f.gear.guard)));
    f.hp = Math.max(0, f.hp - damage);
    f.dead = f.hp <= 0;
    f.hitAt = now;
    hurt.add(hit.account);
  }
  const regen = now >= (typeof state.regenAt === "number" ? state.regenAt : 0);
  for (const [account, f] of fighters) {
    if (hurt.has(account)) {
      await $room.updateUserState(account, { hp: f.hp, dead: f.dead, hitAt: f.hitAt }, { returnState: false });
    } else if (regen && !f.dead && f.hp < f.maxHp && now - f.hitAt >= CALM_MS) {
      const hp = Math.min(f.maxHp, f.hp + Math.ceil(f.maxHp * REGEN_SHARE));
      await $room.updateUserState(account, { hp }, { returnState: false });
    }
  }
  // Written only when something changed (or they were just spawned): most ticks of a quiet room write nothing.
  if (JSON.stringify(tidy(monsters)) !== JSON.stringify(state.monsters ?? null)) await writeMonsters(monsters);
  if (regen) await $room.updateRoomState({ regenAt: now + REGEN_MS }, { returnState: false });
}

// What one blow or skill did: the monsters it felled and the XP they pay.
// The kinds felled, for their loot; the server fills gold and items in after paying out.
export interface HitResult {
  hit: string[];
  killed: string[];
  xp: number;
  felled: MonsterType[];
  gold: number;
  items: string[];
}

export const NOTHING: HitResult = { hit: [], killed: [], xp: 0, felled: [], gold: 0, items: [] };

function land(monsters: Record<string, MonsterState>, ids: string[], damage: number, stunMs: number, now: number): HitResult {
  const out: HitResult = { ...NOTHING, hit: [], killed: [], felled: [], items: [] };
  for (const id of ids) {
    const m = monsters[id];
    if (!m?.alive) continue;
    out.hit.push(id);
    m.hp = Math.max(0, m.hp - damage);
    if (stunMs > 0) m.stunnedUntil = Math.max(m.stunnedUntil, now + stunMs);
    if (m.hp <= 0) {
      const spec = MONSTERS[m.type];
      m.alive = false;
      m.respawnAt = now + spec.respawnMs;
      out.killed.push(id);
      out.felled.push(m.type);
      out.xp += spec.xp;
    }
  }
  return out;
}

// You, able to fight: standing somewhere and not fallen. Also your whole room user state. Where you
// face comes with the attack itself (turning is free, and the pose it would ride on may lag behind).
async function me(yaw: unknown): Promise<{ f: Fighter & { pose: Pose }; state: Record<string, any> }> {
  const state = await $room.getMyState();
  const f = readFighter(state);
  if (f.dead || !f.pose) throw new RuleViolation("unavailable");
  const facing = typeof yaw === "number" && Number.isFinite(yaw) ? yaw : f.pose.yaw;
  return { f: { ...f, pose: { ...f.pose, yaw: facing } }, state };
}

// Your attack on one monster: in reach of where you stand, facing it, no sooner than your weapon allows.
export async function strike(zone: ZoneId, monsterId: unknown, yaw: unknown, now: number): Promise<HitResult> {
  if (typeof monsterId !== "string") throw new RuleViolation("no_monster");
  const { f, state } = await me(yaw);
  const readyAt = state.strikeReadyAt;
  if (typeof readyAt === "number" && now < readyAt) throw new RuleViolation("too_fast");
  const monsters = await readMonsters(zone);
  const m = monsters[monsterId];
  if (!m) throw new RuleViolation("no_monster");
  if (!m.alive) throw new RuleViolation("monster_dead");
  const weapon = WEAPONS[f.playerClass];
  if (!inStrikeReach(f.pose, m, weapon, true)) throw new RuleViolation("out_of_range");
  await $room.updateMyState({ strikeReadyAt: now + weapon.intervalMs * COOLDOWN_GRACE }, { returnState: false });
  const result = land(monsters, [monsterId], damageAt(weapon.damage, f.level, f.gear.power), 0, now);
  await writeMonsters(monsters);
  return result;
}

// One of your class's skills (slot 0 to 2), once your level has opened it and its own cooldown is
// over: every monster it reaches takes its damage (and stun); a heal also mends you and everyone
// standing close.
export async function useSkill(zone: ZoneId, rawSlot: unknown, yaw: unknown, now: number): Promise<HitResult> {
  const slot = readSlot(rawSlot ?? 0);
  if (slot === null) throw new RuleViolation("unavailable");
  const { f, state: mine } = await me(yaw);
  const skill = SKILLS[f.playerClass][slot];
  if (f.level < skill.level) throw new RuleViolation("unavailable");
  const ready: Record<string, unknown> = mine.skillReady && typeof mine.skillReady === "object" ? mine.skillReady : {};
  const readyAt = ready[slot];
  if (typeof readyAt === "number" && now < readyAt) throw new RuleViolation("too_fast");
  await $room.updateMyState(
    { skillReady: { ...ready, [slot]: now + skill.cooldownMs * COOLDOWN_GRACE } },
    { returnState: false },
  );
  if (skill.heal > 0) {
    const state = await $room.getRoomState([]);
    const users: (Record<string, any> & { account: string })[] = await $room.getUserStates(
      state.$users, ["pose", "look", "hp", "maxHp", "dead"],
    );
    for (const u of users) {
      const other = readFighter(u);
      if (other.dead || !other.pose) continue;
      if (Math.hypot(other.pose.x - f.pose.x, other.pose.z - f.pose.z) > skill.reach + RANGE_SLACK) continue;
      const heal = Math.round(skill.heal * (1 + f.gear.heal));
      await $room.updateUserState(u.account, { hp: Math.min(other.maxHp, other.hp + heal) }, { returnState: false });
    }
  }
  const monsters = await readMonsters(zone);
  const targets = skillTargets(f.pose, monsters, skill, true);
  if (targets.length === 0) return { ...NOTHING };
  const result = land(monsters, targets, damageAt(skill.damage, f.level, f.gear.power), skill.stunMs, now);
  await writeMonsters(monsters);
  return result;
}

