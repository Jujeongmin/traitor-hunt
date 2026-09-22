import type { ItemId } from "../account/items";
import type { ZoneId } from "./zones";
import { zoneLayout } from "./zones";

// Every kind of monster, in one table: adding a monster is a row here and a look in
// render/monsterLooks.ts. Numbers are per hit and per second where it matters.
export type MonsterType =
  | "green_blob" | "mushnub" | "rat" | "frog"
  | "spider" | "snake" | "wasp" | "goleling" | "bat"
  | "dire_spider" | "venom_snake" | "hornet" | "vampire_bat" | "stone_golem"
  | "mushnub_guard" | "mushroom_king";

export interface MonsterSpec {
  name: string;
  // Its level: a hunter more than XP_GRACE levels above it earns less for it.
  level: number;
  hp: number;
  damage: number;
  // How close it must be to hit, and how often it can.
  range: number;
  attackMs: number;
  // Metres a second.
  speed: number;
  // How far away it notices a player.
  aggro: number;
  // Paid to whoever dealt it the most damage (see topHitter).
  xp: number;
  // Footprint radius, for bodies not walking through each other.
  body: number;
  // How long it stays down before it comes back where it started.
  respawnMs: number;
  // Gold paid to whoever dealt it the most damage, somewhere between the two; and what it may drop,
  // each on its own chance (0 to 1).
  gold: [number, number];
  drops: { item: ItemId; chance: number }[];
}

// The boss's moves, beyond biting whoever is closest (see stepBoss in monsterAi.ts).
export const BOSS_MOVES = {
  // Every slamEveryMs it rears up for slamWarnMs (a red ring shows where it will land), then strikes
  // everyone within slamRadius for slamDamage (a raised guard facing it still helps).
  slamEveryMs: 12_000,
  slamWarnMs: 1_500,
  slamRadius: 7,
  slamDamage: 140,
  // At these shares of its health it calls its brood: this many of the kind, around it.
  summonAt: [0.7, 0.4],
  summonCount: 4,
  summonType: "mushnub_guard" as const,
  // Below this share it rages: attacks come this much faster and harder.
  rageBelow: 0.25,
  rageSpeed: 0.6,
  rageDamage: 1.3,
};

const common = { range: 1.5, attackMs: 1400, speed: 1.8, aggro: 9, body: 0.4, respawnMs: 15_000 };
// What the first field's monsters carry, and the second's.
const field1 = {
  ...common, gold: [3, 8] as [number, number],
  drops: [
    { item: "potion_small", chance: 0.15 }, { item: "weapon_1", chance: 0.02 }, { item: "armor_1", chance: 0.02 },
    { item: "jelly", chance: 0.3 }, { item: "stone", chance: 0.05 },
  ] as MonsterSpec["drops"],
};
const field3 = {
  ...common, aggro: 12, gold: [30, 60] as [number, number],
  drops: [
    { item: "potion_big", chance: 0.12 }, { item: "weapon_2", chance: 0.03 }, { item: "armor_2", chance: 0.03 },
    { item: "core", chance: 0.18 }, { item: "stone", chance: 0.14 },
  ] as MonsterSpec["drops"],
};
const field2 = {
  ...common, gold: [10, 22] as [number, number],
  drops: [
    { item: "potion_small", chance: 0.2 }, { item: "potion_big", chance: 0.05 },
    { item: "weapon_2", chance: 0.015 }, { item: "armor_2", chance: 0.015 },
    { item: "silk", chance: 0.22 }, { item: "stone", chance: 0.1 },
  ] as MonsterSpec["drops"],
};

// The first field is for levels 1 to about 11, the second for 12 to 29, the deep forest for 28 to
// 40 (its monsters are the second field's, grown and darker); the boss is a level-32 fight for a group. Health, damage and XP climb with each monster's level.
export const MONSTERS: Record<MonsterType, MonsterSpec> = {
  green_blob: { ...field1, name: "초록 슬라임", level: 1, hp: 50, damage: 5, speed: 1.6, xp: 6 },
  mushnub: { ...field1, name: "버섯돌이", level: 3, hp: 80, damage: 8, xp: 9 },
  rat: { ...field1, name: "들쥐", level: 5, hp: 110, damage: 11, speed: 2.4, xp: 12 },
  frog: { ...field1, name: "개구리", level: 7, hp: 150, damage: 14, xp: 15 },
  spider: { ...field2, name: "숲거미", level: 12, hp: 420, damage: 26, speed: 2.2, aggro: 11, xp: 40 },
  snake: { ...field2, name: "독사", level: 15, hp: 480, damage: 30, aggro: 10, xp: 48 },
  wasp: { ...field2, name: "말벌", level: 18, hp: 520, damage: 34, speed: 2.6, aggro: 12, xp: 56 },
  bat: { ...field2, name: "박쥐", level: 21, hp: 600, damage: 38, speed: 2.8, aggro: 12, xp: 64 },
  goleling: { ...field2, name: "골렘링", level: 24, hp: 800, damage: 44, speed: 1.7, aggro: 10, body: 0.5, xp: 80 },
  dire_spider: { ...field3, name: "거대 독거미", level: 28, hp: 1400, damage: 58, speed: 2.3, xp: 120 },
  venom_snake: { ...field3, name: "맹독사", level: 31, hp: 1600, damage: 64, xp: 140 },
  hornet: { ...field3, name: "장수말벌", level: 34, hp: 1700, damage: 70, speed: 2.8, xp: 160 },
  vampire_bat: { ...field3, name: "흡혈박쥐", level: 37, hp: 1900, damage: 76, speed: 3, xp: 180 },
  stone_golem: { ...field3, name: "바위 골렘", level: 40, hp: 3200, damage: 90, speed: 1.6, body: 0.8, xp: 240 },
  // The boss's brood: they come when it calls, and do not come back.
  mushnub_guard: {
    ...common, name: "버섯 호위병", level: 30, hp: 900, damage: 40, speed: 2.2, aggro: 30, xp: 60,
    gold: [5, 10], drops: [],
  },
  mushroom_king: {
    name: "버섯왕", level: 32, hp: 30000, damage: 90, range: 2.8, attackMs: 1800, speed: 1.6, aggro: 22, body: 1.0, xp: 6000,
    respawnMs: 300_000, gold: [800, 1200],
    drops: [
      { item: "potion_big", chance: 1 }, { item: "weapon_3", chance: 0.25 }, { item: "armor_3", chance: 0.25 },
      { item: "spore", chance: 1 }, { item: "spore", chance: 0.5 }, { item: "stone", chance: 1 }, { item: "stone", chance: 1 },
    ],
  },
};

// What felling a monster pays: gold and the items that dropped. random gives numbers in [0, 1).
export interface Loot { gold: number; items: ItemId[] }

export function rollLoot(type: MonsterType, random: () => number = Math.random): Loot {
  const spec = MONSTERS[type];
  const [low, high] = spec.gold;
  return {
    gold: low + Math.floor(random() * (high - low + 1)),
    items: spec.drops.filter((d) => random() < d.chance).map((d) => d.item),
  };
}

// Which monsters stand on a zone's Z cells, taken in turn; the boss stands on K.
export const ZONE_MONSTERS: Record<ZoneId, MonsterType[]> = {
  village: [],
  forest1: ["green_blob", "mushnub", "rat", "frog"],
  forest2: ["spider", "snake", "wasp", "goleling", "bat"],
  forest3: ["dire_spider", "venom_snake", "hornet", "vampire_bat", "stone_golem"],
  boss: [],
};
export const ZONE_BOSS: Partial<Record<ZoneId, MonsterType>> = { boss: "mushroom_king" };

// A monster in a room, as the room state carries it.
export interface MonsterState {
  type: MonsterType;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  // Server time until which it stands dazed.
  stunnedUntil: number;
  // Server time of its next possible attack; each attack moves it forward, which the client plays.
  attackReadyAt: number;
  // Server time it comes back, once down.
  respawnAt: number;
  // Where it started, where it returns to and comes back.
  homeX: number;
  homeZ: number;
  // The boss only: when its next slam comes, whether it is rearing up for one now (the client's
  // warning ring), and how many of its calls for the brood it has made.
  slamAt?: number;
  slamming?: boolean;
  calls?: number;
  // Called by the boss: gone for good once felled.
  summoned?: boolean;
  // The damage each hunter has dealt it since it was last whole, by account.
  hitters?: Record<string, number>;
}

// Who a fallen monster's XP, gold and drops go to: of the hunters in `present`, the one who dealt it
// the most damage (on a tie, whoever hit it first). Everyone who hit it at all counts the kill toward
// their quest; they come after the owner here, most damage first.
export function rankHitters(hitters: Record<string, number>, present: ReadonlySet<string>): string[] {
  return Object.entries(hitters)
    .filter(([account]) => present.has(account))
    .sort((a, b) => b[1] - a[1])
    .map(([account]) => account);
}

export function readMonsterType(value: unknown): MonsterType | null {
  return typeof value === "string" && value in MONSTERS ? (value as MonsterType) : null;
}

function fresh(type: MonsterType, x: number, z: number): MonsterState {
  return { type, x, z, yaw: 0, hp: MONSTERS[type].hp, alive: true, stunnedUntil: 0, attackReadyAt: 0, respawnAt: 0, homeX: x, homeZ: z };
}

// The monsters a zone starts with, keyed by id.
export function spawnMonsters(zone: ZoneId): Record<string, MonsterState> {
  const layout = zoneLayout(zone);
  const kinds = ZONE_MONSTERS[zone];
  const out: Record<string, MonsterState> = {};
  if (kinds.length > 0) {
    layout.zombieSpawns.forEach((p, i) => {
      out[`m${i}`] = fresh(kinds[i % kinds.length], p.x, p.z);
    });
  }
  const boss = ZONE_BOSS[zone];
  if (boss && layout.bossSpawn) out.boss = fresh(boss, layout.bossSpawn.x, layout.bossSpawn.z);
  return out;
}

// Back where it started, whole again.
export function respawned(m: MonsterState): MonsterState {
  return { ...fresh(m.type, m.homeX, m.homeZ) };
}

// Levels a hunter can be above a monster before it pays less XP; past that each level takes away
// XP_FALLOFF of it, down to XP_FLOOR.
export const XP_GRACE = 5;
const XP_FALLOFF = 0.1;
const XP_FLOOR = 0.1;

export function xpFor(type: MonsterType, hunterLevel: number): number {
  const over = hunterLevel - MONSTERS[type].level - XP_GRACE;
  const share = over <= 0 ? 1 : Math.max(XP_FLOOR, 1 - over * XP_FALLOFF);
  return Math.max(1, Math.round(MONSTERS[type].xp * share));
}

// Player health: a little more with every level.
export function maxHpAt(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 12;
}

// Player hits land a little harder with every level, and with a better weapon (power: extra share).
export function damageAt(base: number, level: number, power = 0): number {
  return Math.round(base * (1 + (Math.max(1, level) - 1) * 0.06) * (1 + power));
}
