import type { ItemId } from "../account/items";
import type { ZoneId } from "./zones";
import { zoneLayout } from "./zones";

// Every kind of monster, in one table: adding a monster is a row here and a look in
// render/monsterLooks.ts. Numbers are per hit and per second where it matters.
export type MonsterType =
  | "green_blob" | "mushnub" | "rat" | "frog"
  | "spider" | "snake" | "wasp" | "goleling" | "bat"
  | "mushroom_king";

export interface MonsterSpec {
  name: string;
  hp: number;
  damage: number;
  // How close it must be to hit, and how often it can.
  range: number;
  attackMs: number;
  // Metres a second.
  speed: number;
  // How far away it notices a player.
  aggro: number;
  // Paid to whoever lands the killing blow.
  xp: number;
  // Footprint radius, for bodies not walking through each other.
  body: number;
  // How long it stays down before it comes back where it started.
  respawnMs: number;
  // Gold paid to whoever fells it, somewhere between the two; and what it may drop, each on its own
  // chance (0 to 1).
  gold: [number, number];
  drops: { item: ItemId; chance: number }[];
}

const common = { range: 1.5, attackMs: 1400, speed: 1.8, aggro: 9, body: 0.4, respawnMs: 12_000 };
// What the first field's monsters carry, and the second's.
const field1 = {
  ...common, gold: [3, 8] as [number, number],
  drops: [{ item: "potion_small", chance: 0.15 }, { item: "weapon_1", chance: 0.02 }, { item: "armor_1", chance: 0.02 }] as MonsterSpec["drops"],
};
const field2 = {
  ...common, gold: [10, 22] as [number, number],
  drops: [
    { item: "potion_small", chance: 0.2 }, { item: "potion_big", chance: 0.05 },
    { item: "weapon_2", chance: 0.015 }, { item: "armor_2", chance: 0.015 },
  ] as MonsterSpec["drops"],
};

export const MONSTERS: Record<MonsterType, MonsterSpec> = {
  green_blob: { ...field1, name: "초록 슬라임", hp: 60, damage: 6, speed: 1.6, xp: 8 },
  mushnub: { ...field1, name: "버섯돌이", hp: 70, damage: 7, xp: 9 },
  rat: { ...field1, name: "들쥐", hp: 55, damage: 8, speed: 2.4, xp: 9 },
  frog: { ...field1, name: "개구리", hp: 80, damage: 9, xp: 11 },
  spider: { ...field2, name: "숲거미", hp: 130, damage: 14, speed: 2.2, aggro: 11, xp: 20 },
  snake: { ...field2, name: "독사", hp: 110, damage: 16, aggro: 10, xp: 20 },
  wasp: { ...field2, name: "말벌", hp: 100, damage: 13, speed: 2.6, aggro: 12, xp: 20 },
  goleling: { ...field2, name: "골렘링", hp: 160, damage: 16, speed: 1.7, aggro: 10, body: 0.5, xp: 26 },
  bat: { ...field2, name: "박쥐", hp: 90, damage: 12, speed: 2.8, aggro: 12, xp: 18 },
  mushroom_king: {
    name: "버섯왕", hp: 2500, damage: 32, range: 2.8, attackMs: 1800, speed: 1.6, aggro: 22, body: 1.0, xp: 400,
    respawnMs: 120_000, gold: [150, 250],
    drops: [{ item: "potion_big", chance: 1 }, { item: "weapon_3", chance: 0.25 }, { item: "armor_3", chance: 0.25 }],
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

// Player health: a little more with every level.
export function maxHpAt(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 12;
}

// Player hits land a little harder with every level, and with a better weapon (power: extra share).
export function damageAt(base: number, level: number, power = 0): number {
  return Math.round(base * (1 + (Math.max(1, level) - 1) * 0.06) * (1 + power));
}
