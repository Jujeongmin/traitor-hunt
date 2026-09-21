import { solidWith, type LevelLayout } from "../rules/levelLayout";
import type { SolidTest } from "../rules/movement";
import { findPath } from "../rules/pathfinding";
import { BIND_MS, PLATE_RADIUS, PLATE_RING_RADIUS, VOTE_DECIDE_HOLD_MS, VOTE_DURATION_MS } from "./constants";
import { isActive } from "./lifecycle";
import { endPossession } from "./possession";
import type { MatchEvent, Poses, PublicMatch, SecretMatch, Vec2 } from "./types";
import { distance } from "./view";

// Plate i names match.players[i]; the plate after the last player is "skip" (accused null).
export interface PlateTally { plate: number; accused: string | null; votes: number; voters: string[] }

const SEARCH_RADIUS = 24;
const SEARCH_STEP = 1;

export function skipPlate(match: PublicMatch): number {
  return match.players.length;
}

export function votesNeeded(match: PublicMatch): number {
  return Math.floor(match.players.filter((p) => isActive(match, p)).length / 2) + 1;
}

export function tallyPlates(match: PublicMatch, poses: Poses, plates: Vec2[]): PlateTally[] {
  return plates.map((plate, i) => {
    const accused = i < match.players.length ? match.players[i] : null;
    const open = accused === null || isActive(match, accused);
    const voters = open
      ? match.players.filter((p) => {
        const pose = poses[p];
        return p !== accused && isActive(match, p) && !!pose && distance(pose, plate) <= PLATE_RADIUS;
      })
      : [];
    return { plate: i, accused, votes: voters.length, voters };
  });
}

// Plates on a ring, every one with a plate's width of floor around it.
function ring(center: Vec2, count: number): Vec2[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: center.x + Math.sin(a) * PLATE_RING_RADIUS, z: center.z - Math.cos(a) * PLATE_RING_RADIUS };
  });
}

// Nothing solid anywhere on the plate or just past its rim: sampled in rings, so a small standing
// stone cannot hide between the samples.
function clear(point: Vec2, isSolid: SolidTest): boolean {
  if (isSolid(point.x, point.z)) return false;
  for (const r of [PLATE_RADIUS * 0.5, PLATE_RADIUS, PLATE_RADIUS + 0.2]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (isSolid(point.x + Math.cos(a) * r, point.z + Math.sin(a) * r)) return false;
    }
  }
  return true;
}

function lineClear(a: Vec2, b: Vec2, isSolid: SolidTest): boolean {
  const steps = Math.ceil(distance(a, b) / 0.25);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (isSolid(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

// Finds open floor near the middle of the living players, reachable from them, where every plate fits.
export function placePlates(level: LevelLayout, openGates: readonly number[], from: Vec2[], count: number): Vec2[] {
  const isSolid = solidWith(level, openGates);
  const start = from[0] ?? level.playerSpawn;
  const middle = from.length === 0 ? start
    : { x: from.reduce((s, p) => s + p.x, 0) / from.length, z: from.reduce((s, p) => s + p.z, 0) / from.length };

  const candidates: Vec2[] = [];
  for (let dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx += SEARCH_STEP) {
    for (let dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz += SEARCH_STEP) {
      if (Math.hypot(dx, dz) <= SEARCH_RADIUS) candidates.push({ x: middle.x + dx, z: middle.z + dz });
    }
  }
  candidates.sort((a, b) => distance(a, middle) - distance(b, middle));
  for (const center of candidates) {
    if (!clear(center, isSolid)) continue;
    const plates = ring(center, count);
    if (!plates.every((p) => clear(p, isSolid) && lineClear(center, p, isSolid))) continue;
    if (!findPath(level, start, center, isSolid)) continue;
    return plates;
  }
  return ring(level.playerSpawn, count);
}

export function stepVote(match: PublicMatch, secret: SecretMatch, poses: Poses, level: LevelLayout, now: number): MatchEvent[] {
  if (match.phase !== "playing") return [];
  const vote = match.vote;
  const gates = match.objectives.gates.length;
  // Once the traitor is out there is nothing left to vote on.
  if (match.revealed !== null) {
    vote.held = gates;
    vote.round = null;
    return [];
  }
  if (!vote.round) {
    if (vote.held >= gates) return [];
    vote.held += 1;
    const living = match.players.filter((p) => isActive(match, p)).map((p) => poses[p]).filter((p): p is NonNullable<typeof p> => !!p);
    const plates = placePlates(level, match.objectives.gates, living, skipPlate(match) + 1);
    vote.round = { startedAt: now, endsAt: now + VOTE_DURATION_MS, plates, leading: null, since: now };
    return [];
  }

  const round = vote.round;
  const tallies = tallyPlates(match, poses, round.plates);
  const needed = votesNeeded(match);
  const majority = tallies.find((t) => t.votes >= needed) ?? null;
  if (!majority) {
    round.leading = null;
  } else if (round.leading !== majority.plate) {
    round.leading = majority.plate;
    round.since = now;
  } else if (now - round.since >= VOTE_DECIDE_HOLD_MS) {
    return decide(match, secret, majority.accused, now);
  }
  if (now < round.endsAt) return [];

  const top = Math.max(...tallies.map((t) => t.votes));
  const leaders = tallies.filter((t) => t.votes === top);
  const accused = top > 0 && leaders.length === 1 ? leaders[0].accused : null;
  return decide(match, secret, accused, now);
}

function decide(match: PublicMatch, secret: SecretMatch, accused: string | null, now: number): MatchEvent[] {
  const guilty = accused !== null && accused === secret.traitor;
  match.vote.round = null;
  match.vote.last = { accused, guilty, at: now };
  if (accused === null) return [];
  if (guilty) {
    match.revealed = accused;
    return endPossession(match, secret, now);
  }
  match.bound[accused] = now + BIND_MS;
  return [];
}
