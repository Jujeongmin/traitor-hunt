// Shapes the client and the server share for the open world.

export interface Vec2 { x: number; z: number }

// Where a player stands and what they are doing. y: feet height (jumps and platforms). block: the
// guard is up. swing and skill: how many attacks and skills so far, so others can play each one.
export interface Pose extends Vec2 { yaw: number; y?: number; block?: boolean; swing?: number; skill?: number }

// An attack or skill count from a client: a whole number, kept small so it never grows without bound.
export function readSwing(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value % 1_000_000 : 0;
}

export function isPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

// Positions arrive throttled from clients, so range checks allow for lag.
export const RANGE_SLACK = 1.5;

export const RULE_ERRORS = [
  "unavailable", "not_owned", "no_character", "character_limit", "no_zone", "not_near", "zone_full", "too_fast", "blocking",
  "no_monster", "monster_dead", "out_of_range",
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

// Bumped whenever client and server stop understanding each other.
export const PROTOCOL_VERSION = 10;
