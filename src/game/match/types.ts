export type Phase = "lobby" | "playing" | "ended";
export type Winner = "adventurers" | "traitor";
// humans_out: only bots are left in play (the traitor, always a person, is out too).
export type EndReason = "escaped" | "wiped" | "humans_out";

export interface Vec2 { x: number; z: number }
// y: how high the player has jumped. Only drawn, never used by a rule; missing means standing.
export interface Pose extends Vec2 { yaw: number; y?: number }
export type Poses = Record<string, Pose | null>;

export type MonsterKind = "zombie" | "boss";

export interface MonsterState {
  kind: MonsterKind;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  alive: boolean;
  possessed: boolean;
  stunnedUntil: number;
  attackReadyAt: number;
}

export type Stage = "shards" | "devices" | "seal" | "boss" | "exit";
export const STAGES: readonly Stage[] = ["shards", "devices", "seal", "boss", "exit"];

export interface SealState {
  progressMs: number;
  // Server time the channel was last advanced; null until someone starts it at the altar.
  lastAt: number | null;
  waves: number;
}

export interface ObjectiveState {
  stage: Stage;
  shards: boolean[];
  // Server time each device stays on until.
  devices: number[];
  gates: number[];
  seal: SealState;
}

// accused is null when the round was skipped or undecided.
export interface VoteRecord { accused: string | null; guilty: boolean; at: number }

export interface VoteRound {
  startedAt: number;
  endsAt: number;
  // plates[i] names players[i]; the last plate is "skip".
  plates: Vec2[];
  // Plate a majority stands on right now, and since when.
  leading: number | null;
  since: number;
}

export interface VoteState {
  // Rounds opened so far; one opens for each gate.
  held: number;
  round: VoteRound | null;
  last: VoteRecord | null;
}

export interface SecretRef { collection: string; id: string }
export interface MatchResult { winner: Winner; reason: EndReason; traitor: string }

export interface PublicMatch {
  version: 1;
  phase: Phase;
  players: string[];
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  endedAt: number | null;
  monsters: Record<string, MonsterState>;
  dead: string[];
  escaped: string[];
  result: MatchResult | null;
  // Filled by the server when the match ends; the traitor is public by then.
  results: PlayerResult[] | null;
  secretRef: SecretRef | null;
  objectives: ObjectiveState;
  // Account -> server time their binding ends.
  bound: Record<string, number>;
  // The traitor, once a plate vote has exposed them.
  revealed: string | null;
  vote: VoteState;
  devClockOffsetMs: number;
}

export interface Possession { monsterId: string; endsAt: number }

// Per-player counters for one match. Kept secret: traitor-side numbers would reveal the traitor.
export interface PlayerStats {
  monsterKills: number;
  monsterDamage: number;
  traitorDamage: number;
  possessions: number;
  possessedDamage: number;
}

export interface SecretMatch {
  traitor: string;
  hp: Record<string, number>;
  possession: Possession | null;
  readyAt: number;
  lastShotAt: Record<string, number>;
  stats: Record<string, PlayerStats>;
}

export interface PlayerResult {
  account: string;
  role: "adventurer" | "traitor";
  won: boolean;
  escaped: boolean;
  died: boolean;
  reason: EndReason;
  durationMs: number;
  endedAt: number;
  stats: PlayerStats;
}

export type MatchEvent =
  | { type: "private"; account: string }
  | { type: "pain"; x: number; z: number; to: string[] }
  | { type: "possession"; monsterId: string; active: boolean; endsAt: number | null }
  | { type: "ended" };

export const RULE_ERRORS = [
  "not_playing", "not_traitor", "not_ready", "already_possessing", "not_possessing",
  "unavailable", "no_monster", "monster_dead", "out_of_range", "out_of_reach", "too_fast",
  "not_authority", "stunned", "no_target", "not_at_exit", "match_full",
  "nothing_here", "need_shards", "exit_locked", "sealed", "bound",
  "nickname_invalid", "nickname_taken",
  "friend_not_found", "friend_self", "already_friends", "friend_limit", "request_limit", "no_request",
  "not_friends", "party_full", "already_in_party", "no_invite", "not_leader", "party_busy",
] as const;

export type RuleError = (typeof RULE_ERRORS)[number];

export class RuleViolation extends Error {
  readonly code: RuleError;
  constructor(code: RuleError) {
    super(code);
    this.code = code;
    this.name = "RuleViolation";
  }
}

export interface MonsterSpawn { id: string; x: number; z: number }
