export const PROTOCOL_VERSION = 7;
export const MATCH_PLAYERS = 4;
// How long an online lobby waits for people before bots take the empty seats.
export const LOBBY_FILL_MS = 15_000;
export const PLAYER_HP = 100;

export const POSSESS_FIRST_READY_MS = 60_000;
export const POSSESS_DURATION_MS = 8_000;
export const POSSESS_COOLDOWN_MS = 45_000;
export const POSSESS_RANGE = 12;
export const LINK_DAMAGE_RATIO = 0.4;
export const MONSTER_DEATH_BODY_DAMAGE = 35;
export const PAIN_RADIUS = 10;

export const MONSTER_STATS = {
  // reachY: how far above the floor its swing still lands. A zombie cannot hit you on a high block
  // (see platforms.ts); the boss reaches anywhere.
  zombie: { hp: 100, damage: 20, range: 1.8, intervalMs: 1_200, speed: 1.8, aggro: 14, reachY: 0.7 },
  boss: { hp: 800, damage: 35, range: 2.6, intervalMs: 1_600, speed: 1.5, aggro: 26, reachY: Infinity },
} as const;

export const ZOMBIE_HP = MONSTER_STATS.zombie.hp;
export const ZOMBIE_ATTACK_DAMAGE = MONSTER_STATS.zombie.damage;
export const ZOMBIE_ATTACK_RANGE = MONSTER_STATS.zombie.range;
export const ZOMBIE_ATTACK_INTERVAL_MS = MONSTER_STATS.zombie.intervalMs;

export const AKM_DAMAGE = 34;
export const AKM_FIRE_INTERVAL_MS = 100;
export const AKM_RANGE = 60;

// Positions arrive throttled from clients, so range checks allow for lag.
export const RANGE_SLACK = 1.5;
export const EXIT_RADIUS = 2;

// In-match objectives (Plan 4).
export const SHARD_COUNT = 2;
export const DEVICE_COUNT = 2;
export const INTERACT_RANGE = 3;
export const DEVICE_ACTIVE_MS = 8_000;
export const SEAL_DURATION_MS = 60_000;
export const SEAL_RADIUS = 6;
// Server ticks can stall; one tick never adds more than this to the seal.
export const SEAL_TICK_CAP_MS = 2_000;
export const SEAL_WAVE_AT_MS = [0, 20_000, 40_000] as const;
export const WAVE_SIZE = 3;

// Plate votes (Plan 4).
export const PLATE_RADIUS = 1.2;
export const PLATE_RING_RADIUS = 2.4;
export const VOTE_DURATION_MS = 30_000;
// A majority standing on one plate this long decides before the time is up.
export const VOTE_DECIDE_HOLD_MS = 3_000;
export const BIND_MS = 20_000;
