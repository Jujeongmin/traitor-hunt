import { RuleViolation } from "../world/types";

export const PARTY_MAX = 4;
export const INVITE_TTL_MS = 120_000;
// Invites one account can hold; a new one pushes out the oldest.
export const INVITE_LIMIT = 10;
// Where a player is: on the menu or out in the world.
export type Activity = "menu" | "world";

export function readActivity(raw: unknown): Activity {
  return raw === "world" ? "world" : "menu";
}

export interface Party {
  leader: string;
  // The leader is always one of the members.
  members: string[];
}

export interface PartyInvite {
  from: string;
  at: number;
}

export function checkInvite(party: Party | null, to: string, inviterFriends: string[]): void {
  if (!inviterFriends.includes(to)) throw new RuleViolation("not_friends");
  if (party?.members.includes(to)) throw new RuleViolation("already_in_party");
  if (party && party.members.length >= PARTY_MAX) throw new RuleViolation("party_full");
}

// `inviter`'s party gains `joiner`; with no party yet, the inviter leads a new one.
export function joinParty(party: Party | null, inviter: string, joiner: string): Party {
  const next: Party = party ? { leader: party.leader, members: [...party.members] } : { leader: inviter, members: [inviter] };
  if (next.members.includes(joiner)) return next;
  if (next.members.length >= PARTY_MAX) throw new RuleViolation("party_full");
  next.members.push(joiner);
  return next;
}

// Null once fewer than two are left: a party of one is no party.
export function leaveParty(party: Party, account: string): Party | null {
  const members = party.members.filter((m) => m !== account);
  if (members.length < 2) return null;
  return { leader: members.includes(party.leader) ? party.leader : members[0], members };
}

export function kickFromParty(party: Party, by: string, target: string): Party | null {
  if (party.leader !== by) throw new RuleViolation("not_leader");
  if (target === by || !party.members.includes(target)) throw new RuleViolation("unavailable");
  return leaveParty(party, target);
}

export function readInvites(raw: unknown, now: number): PartyInvite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i): i is PartyInvite =>
    !!i && typeof i === "object" && typeof i.from === "string" && typeof i.at === "number" && now - i.at <= INVITE_TTL_MS);
}

export function addInvite(invites: PartyInvite[], from: string, now: number): PartyInvite[] {
  return [...invites.filter((i) => i.from !== from), { from, at: now }].slice(-INVITE_LIMIT);
}

export interface PartyMemberView {
  account: string;
  nickname: string | null;
  costume: string;
  playerClass: string;
  online: boolean;
  activity: Activity;
}

export interface PartyView {
  party: { leader: string; members: PartyMemberView[] } | null;
  invites: { account: string; nickname: string | null }[];
}
