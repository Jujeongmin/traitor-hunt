import {
  DEVICE_COUNT, LOBBY_FILL_MS, MATCH_PLAYERS, MONSTER_STATS, PLAYER_HP, POSSESS_FIRST_READY_MS, SHARD_COUNT,
} from "./constants";
import {
  RuleViolation, type MonsterKind, type MonsterSpawn, type MonsterState, type ObjectiveState, type PlayerStats,
  type PublicMatch, type SecretMatch, type Vec2, type VoteState,
} from "./types";

export function createObjectives(): ObjectiveState {
  return {
    stage: "shards",
    shards: Array.from({ length: SHARD_COUNT }, () => false),
    devices: Array.from({ length: DEVICE_COUNT }, () => 0),
    gates: [],
    seal: { progressMs: 0, lastAt: null, waves: 0 },
  };
}

export function createVote(): VoteState {
  return { held: 0, round: null, last: null };
}

export function createLobby(now: number): PublicMatch {
  return {
    version: 1,
    phase: "lobby",
    players: [],
    looks: {},
    names: {},
    classes: {},
    createdAt: now,
    startedAt: null,
    endsAt: null,
    endedAt: null,
    monsters: {},
    dead: [],
    escaped: [],
    result: null,
    results: null,
    secretRef: null,
    objectives: createObjectives(),
    bound: {},
    revealed: null,
    vote: createVote(),
    devClockOffsetMs: 0,
  };
}

export function newMonster(kind: MonsterKind, x: number, z: number): MonsterState {
  return {
    kind, x, z, yaw: 0, hp: MONSTER_STATS[kind].hp,
    alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
  };
}

export function joinLobby(match: PublicMatch, account: string): void {
  if (match.players.includes(account)) return;
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  if (match.players.length >= MATCH_PLAYERS) throw new RuleViolation("match_full");
  match.players.push(account);
}

export function leaveLobby(match: PublicMatch, account: string): void {
  if (match.phase !== "lobby") throw new RuleViolation("unavailable");
  match.players = match.players.filter((p) => p !== account);
}

// Seats the online lobby adds when people are short. Practice bots ("test-bot-N") are ordinary players.
export function isBot(account: string): boolean {
  return /^bot-\d+$/.test(account);
}

// Fills the empty seats with bots once the lobby has waited LOBBY_FILL_MS; true when it did.
export function fillWithBots(match: PublicMatch, now: number): boolean {
  if (botFillInMs(match, now) !== 0) return false;
  for (let n = 1; match.players.length < MATCH_PLAYERS; n++) {
    if (!match.players.includes(`bot-${n}`)) match.players.push(`bot-${n}`);
  }
  return true;
}

// How long until bots fill the lobby's empty seats; null when nobody is waiting on that.
export function botFillInMs(match: PublicMatch, now: number): number | null {
  if (match.phase !== "lobby" || match.players.length === 0 || match.players.length >= MATCH_PLAYERS) return null;
  return Math.max(0, match.createdAt + LOBBY_FILL_MS - now);
}

// The person whose client drives the monsters and the bots: the first human still in play.
export function matchHost(match: PublicMatch): string | null {
  return match.players.find((p) => !isBot(p) && isActive(match, p)) ?? null;
}

export function startMatch(match: PublicMatch, now: number, rng: () => number, spawns: MonsterSpawn[]): SecretMatch {
  if (match.phase !== "lobby" || match.players.length !== MATCH_PLAYERS) throw new RuleViolation("not_playing");
  // Bots are always adventurers.
  const candidates = match.players.filter((p) => !isBot(p));
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));

  match.phase = "playing";
  match.startedAt = now;
  // No time limit: a match ends when the adventurers are out or down.
  match.endsAt = null;
  match.monsters = {};
  for (const spawn of spawns) match.monsters[spawn.id] = newMonster("zombie", spawn.x, spawn.z);
  match.objectives = createObjectives();
  match.bound = {};
  match.revealed = null;
  match.vote = createVote();

  const hp: Record<string, number> = {};
  const stats: Record<string, PlayerStats> = {};
  for (const p of match.players) {
    hp[p] = PLAYER_HP;
    stats[p] = emptyStats();
  }
  return {
    traitor: candidates[index], hp, possession: null,
    readyAt: now + POSSESS_FIRST_READY_MS, lastShotAt: {}, stats,
  };
}

export function emptyStats(): PlayerStats {
  return { monsterKills: 0, monsterDamage: 0, traitorDamage: 0, possessions: 0, possessedDamage: 0 };
}

export function isActive(match: PublicMatch, account: string): boolean {
  return match.players.includes(account) && !match.dead.includes(account) && !match.escaped.includes(account);
}

export function isBound(match: PublicMatch, account: string, now: number): boolean {
  return (match.bound[account] ?? 0) > now;
}

export function monsterSpawnsFor(layout: { zombieSpawns: Vec2[] }): MonsterSpawn[] {
  return layout.zombieSpawns.map((s, i) => ({ id: `zombie-${i}`, x: s.x, z: s.z }));
}
