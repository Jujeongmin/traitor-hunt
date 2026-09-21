import { isOnline, readFriendLists, type FriendEntry, type FriendSide } from "../../src/game/account/friends";
import {
  readActivity, readInvites, type Party, type PartyInvite, type PartyMemberView,
} from "../../src/game/account/party";
import { levelOf, xpOf } from "../../src/game/account/level";
import { RANKING_SIZE, rankRows, type RankRow } from "../../src/game/account/ranking";
import { COSTUMES, costumeById } from "../../src/game/render/costumes";
import { readClass, type PlayerClass } from "../../src/game/match/classes";
import { isBot } from "../../src/game/match/lifecycle";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { readJumpY } from "../../src/game/rules/movement";
import { maxFeetY } from "../../src/game/rules/platforms";
import { addResult, readProfile } from "../../src/game/match/profile";
import {
  RuleViolation, type PlayerResult, type Pose, type Poses, type PublicMatch, type SecretMatch, type SecretRef,
} from "../../src/game/match/types";

export const RESULTS_COLLECTION = "match_results";
// One row per account, so the board is a short read instead of a scan over every account.
const RANKING_COLLECTION = "ranking";
// Read a few more rows than the board shows, so a row that has slipped down still lands in order.
const RANKING_READ = RANKING_SIZE * 5;

// The one map everyone plays. Poses are checked against its platforms.
export const LEVEL = parseLevel(RUINS, TILE_SIZE);

export function token(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

export function newRoomId(now: number): string {
  return `de-${now.toString(36)}-${token(6)}`;
}

export function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  return $lock(`de-room-${roomId}`, fn);
}

export function withMatchmakingLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-matchmaking", fn);
}

function isMatch(value: unknown): value is PublicMatch {
  return !!value && typeof value === "object" && (value as { version?: unknown }).version === 1;
}

export async function readMatch(roomId: string): Promise<PublicMatch | null> {
  const state = await $global.getRoomState(roomId);
  return isMatch(state.match) ? state.match : null;
}

export async function writeMatch(roomId: string, match: PublicMatch): Promise<void> {
  await $global.updateRoomState(roomId, { match });
}

export async function listLobbies(): Promise<{ roomId: string; match: PublicMatch }[]> {
  const lobbies: { roomId: string; match: PublicMatch }[] = [];
  for (const state of await $global.getAllRoomStates()) {
    if (typeof state.roomId === "string" && isMatch(state.match) && state.match.phase === "lobby") {
      lobbies.push({ roomId: state.roomId, match: state.match });
    }
  }
  return lobbies;
}

// Readable by any client that learns the name: obscurity only, by design (see plan decisions).
export async function createSecret(secret: SecretMatch): Promise<SecretRef> {
  const collection = `ds_${token(24)}`;
  const item = await $global.addCollectionItem(collection, { secret });
  return { collection, id: item.__id };
}

export async function readSecret(match: PublicMatch): Promise<SecretMatch | null> {
  const ref = match.secretRef;
  if (!ref) return null;
  const item = await $global.getCollectionItem(ref.collection, ref.id);
  return (item.secret as SecretMatch | undefined) ?? null;
}

export async function writeSecret(match: PublicMatch, secret: SecretMatch): Promise<void> {
  const ref = match.secretRef;
  if (ref) await $global.updateCollectionItem(ref.collection, { __id: ref.id, secret });
}

export async function deleteSecret(match: PublicMatch): Promise<void> {
  if (match.secretRef) await $global.deleteCollection(match.secretRef.collection);
}

export function isPose(value: unknown): value is Pose {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return [p.x, p.z, p.yaw].every((n) => typeof n === "number" && Number.isFinite(n));
}

export async function readPose(roomId: string, account: string): Promise<Pose | null> {
  const pose: unknown = (await $global.getRoomUserState(roomId, account)).pose;
  return isPose(pose) ? { x: pose.x, z: pose.z, yaw: pose.yaw, y: readJumpY(pose.y), block: pose.block === true } : null;
}

export async function readPoses(roomId: string, accounts: string[]): Promise<Poses> {
  const poses: Poses = {};
  for (const account of accounts) poses[account] = await readPose(roomId, account);
  return poses;
}

export async function writePose(roomId: string, account: string, pose: Pose, at: number): Promise<void> {
  // Trust the height only as far as the map allows: what is under them plus a jump.
  const y = Math.min(readJumpY(pose.y), maxFeetY(LEVEL.platforms, pose.x, pose.z));
  const block = pose.block === true;
  await $global.updateRoomUserState(roomId, account, { pose: { x: pose.x, z: pose.z, yaw: pose.yaw, y, block, at } });
}

// Writes this account's line on the board. Called whenever its XP or its name changes; a fresh
// account that has never finished a match leaves no row behind.
export async function writeRanking(account: string): Promise<void> {
  const state = await $global.getUserState(account);
  const profile = readProfile(state.profile);
  const xp = xpOf(profile);
  if (xp <= 0) return;
  const row: RankRow = {
    account,
    nickname: typeof state.nickname === "string" ? state.nickname : null,
    xp,
    level: levelOf(xp).level,
    games: profile.games,
    wins: profile.wins,
  };
  const id = typeof state.rankingId === "string" ? state.rankingId : null;
  if (id) {
    await $global.updateCollectionItem(RANKING_COLLECTION, { __id: id, ...row });
    return;
  }
  const item = await $global.addCollectionItem(RANKING_COLLECTION, { ...row });
  await $global.updateUserState(account, { rankingId: item.__id });
}

// The board, best first.
export async function readRanking(): Promise<RankRow[]> {
  const items = await $global.getCollectionItems(RANKING_COLLECTION, { limit: RANKING_READ });
  return rankRows(items as unknown as RankRow[]);
}

// The XP of an account, read from the matches it has finished.
export async function readXp(account: string): Promise<number> {
  return xpOf(readProfile((await $global.getUserState(account)).profile));
}

export async function saveResults(matchId: string, results: PlayerResult[]): Promise<void> {
  for (const result of results) {
    if (isBot(result.account)) continue;
    await $global.addCollectionItem(RESULTS_COLLECTION, { ...result, matchId });
    const state = await $global.getUserState(result.account);
    await $global.updateUserState(result.account, { profile: addResult(readProfile(state.profile), result) });
    await writeRanking(result.account);
  }
}

// One item per taken nickname, looked up by its case-insensitive key.
export const NICKNAMES_COLLECTION = "nicknames";

interface NicknameItem { __id: string; key: string; name: string; account: string }

export function withNicknameLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-nicknames", fn);
}

export async function findNickname(key: string): Promise<NicknameItem | null> {
  const [item] = await $global.getCollectionItems(NICKNAMES_COLLECTION, {
    filters: [{ field: "key", operator: "==", value: key }],
    limit: 1,
  });
  return (item as NicknameItem | undefined) ?? null;
}

// Moves the account's nickname to `key`, freeing whatever name it held before. Call inside withNicknameLock.
export async function claimNickname(account: string, key: string, name: string): Promise<void> {
  const owned = await findNickname(key);
  if (owned && owned.account !== account) throw new RuleViolation("nickname_taken");
  const state = await $global.getUserState(account);
  let nicknameId = owned?.__id;
  if (owned) {
    await $global.updateCollectionItem(NICKNAMES_COLLECTION, { __id: owned.__id, name });
  } else {
    if (typeof state.nicknameId === "string") await $global.deleteCollectionItem(NICKNAMES_COLLECTION, state.nicknameId);
    nicknameId = (await $global.addCollectionItem(NICKNAMES_COLLECTION, { key, name, account })).__id;
  }
  await $global.updateUserState(account, { nickname: name, nicknameId });
}

export async function readNickname(account: string): Promise<string | null> {
  const nickname: unknown = (await $global.getUserState(account)).nickname;
  return typeof nickname === "string" ? nickname : null;
}

export function withFriendsLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-friends", fn);
}

export async function readFriendSide(account: string): Promise<FriendSide> {
  return { account, lists: readFriendLists((await $global.getUserState(account)).friendLists) };
}

export async function writeFriendSide(side: FriendSide): Promise<void> {
  await $global.updateUserState(side.account, { friendLists: side.lists });
}

export async function markSeen(account: string, now: number): Promise<void> {
  await $global.updateUserState(account, { lastSeenAt: now });
}

export async function friendEntry(account: string, now: number): Promise<FriendEntry> {
  const state = await $global.getUserState(account);
  return {
    account,
    nickname: typeof state.nickname === "string" ? state.nickname : null,
    online: isOnline(state.lastSeenAt, now),
  };
}

// One item per party; each member's account state also carries a copy, so their menus hear about changes.
export const PARTIES_COLLECTION = "parties";

export interface StoredParty { id: string; party: Party }

export function withPartyLock<T>(fn: () => Promise<T>): Promise<T> {
  return $lock("de-parties", fn);
}

export async function readPartyOf(account: string): Promise<StoredParty | null> {
  const copy: unknown = (await $global.getUserState(account)).party;
  const id = copy && typeof copy === "object" ? (copy as { id?: unknown }).id : null;
  if (typeof id !== "string") return null;
  let item: Record<string, unknown>;
  try {
    item = await $global.getCollectionItem(PARTIES_COLLECTION, id);
  } catch {
    return null; // The party ended without this copy being cleared.
  }
  if (typeof item.leader !== "string" || !Array.isArray(item.members) || !item.members.includes(account)) return null;
  return { id, party: { leader: item.leader, members: item.members } };
}

// Saves `next` in place of `before` (either may be null) and updates the copy of everyone involved.
export async function writeParty(before: StoredParty | null, next: Party | null): Promise<void> {
  let id = before?.id ?? null;
  if (next && id) await $global.updateCollectionItem(PARTIES_COLLECTION, { __id: id, ...next });
  else if (next) id = (await $global.addCollectionItem(PARTIES_COLLECTION, { ...next })).__id;
  else if (id) await $global.deleteCollectionItem(PARTIES_COLLECTION, id);
  const touched = new Set([...(before?.party.members ?? []), ...(next?.members ?? [])]);
  for (const account of touched) {
    const copy = next?.members.includes(account) ? { id, leader: next.leader, members: next.members } : null;
    await $global.updateUserState(account, { party: copy });
  }
}

export async function readPartyInvites(account: string, now: number): Promise<PartyInvite[]> {
  return readInvites((await $global.getUserState(account)).partyInvites, now);
}

export async function writePartyInvites(account: string, invites: PartyInvite[]): Promise<void> {
  await $global.updateUserState(account, { partyInvites: invites });
}

// The class an account picked in the menu, or null for anyone who never picked.
export async function readPlayerClass(account: string): Promise<PlayerClass | null> {
  return readClass((await $global.getUserState(account)).playerClass);
}

// The costume an account picked in the menu, or the first one for anyone who never picked.
export async function readCostume(account: string): Promise<string> {
  const state = await $global.getUserState(account);
  return costumeById(state.costume)?.id ?? COSTUMES[0].id;
}

export async function partyMember(account: string, now: number): Promise<PartyMemberView> {
  const state = await $global.getUserState(account);
  return {
    account,
    nickname: typeof state.nickname === "string" ? state.nickname : null,
    costume: costumeById(state.costume)?.id ?? COSTUMES[0].id,
    online: isOnline(state.lastSeenAt, now),
    activity: readActivity(state.activity),
  };
}
