import { RuleViolation } from "../world/types";

export const FRIEND_LIMIT = 100;
// Pending requests one account can have waiting for it.
export const REQUEST_LIMIT = 50;
export const HEARTBEAT_MS = 30_000;
// A little over two heartbeats, so one late beat does not flicker you offline.
export const ONLINE_WINDOW_MS = 75_000;

export interface FriendLists {
  friends: string[];
  // Requests waiting for this account to answer.
  incoming: string[];
  // Requests this account sent that are not answered yet.
  outgoing: string[];
}

export interface FriendSide {
  account: string;
  lists: FriendLists;
}

export function emptyFriendLists(): FriendLists {
  return { friends: [], incoming: [], outgoing: [] };
}

function accounts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function readFriendLists(raw: unknown): FriendLists {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { friends: accounts(source.friends), incoming: accounts(source.incoming), outgoing: accounts(source.outgoing) };
}

function without(list: string[], account: string): string[] {
  return list.filter((a) => a !== account);
}

function befriend(me: FriendSide, them: FriendSide): void {
  if (me.lists.friends.length >= FRIEND_LIMIT || them.lists.friends.length >= FRIEND_LIMIT) {
    throw new RuleViolation("friend_limit");
  }
  removeFriend(me, them);
  me.lists.friends.push(them.account);
  them.lists.friends.push(me.account);
}

// Sends a request, or accepts theirs if they already asked you.
export function requestFriend(me: FriendSide, them: FriendSide): "requested" | "accepted" {
  if (me.account === them.account) throw new RuleViolation("friend_self");
  if (me.lists.friends.includes(them.account)) throw new RuleViolation("already_friends");
  if (me.lists.incoming.includes(them.account)) {
    befriend(me, them);
    return "accepted";
  }
  if (me.lists.outgoing.includes(them.account)) return "requested";
  if (me.lists.friends.length >= FRIEND_LIMIT || them.lists.friends.length >= FRIEND_LIMIT) {
    throw new RuleViolation("friend_limit");
  }
  if (them.lists.incoming.length >= REQUEST_LIMIT) throw new RuleViolation("request_limit");
  me.lists.outgoing.push(them.account);
  them.lists.incoming.push(me.account);
  return "requested";
}

export function acceptFriend(me: FriendSide, them: FriendSide): void {
  if (!me.lists.incoming.includes(them.account)) throw new RuleViolation("no_request");
  befriend(me, them);
}

// Unfriends, declines their request, or cancels yours: whatever links the two.
export function removeFriend(me: FriendSide, them: FriendSide): void {
  for (const [a, b] of [[me, them], [them, me]]) {
    a.lists.friends = without(a.lists.friends, b.account);
    a.lists.incoming = without(a.lists.incoming, b.account);
    a.lists.outgoing = without(a.lists.outgoing, b.account);
  }
}

export function isOnline(lastSeenAt: unknown, now: number): boolean {
  return typeof lastSeenAt === "number" && now - lastSeenAt <= ONLINE_WINDOW_MS;
}

export interface FriendEntry {
  account: string;
  nickname: string | null;
  online: boolean;
}

export interface FriendsView {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
}
