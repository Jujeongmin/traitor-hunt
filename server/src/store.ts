import { isOnline, readFriendLists, type FriendEntry, type FriendSide } from "../../src/game/account/friends";
import {
  readActivity, readInvites, type Party, type PartyInvite, type PartyMemberView,
} from "../../src/game/account/party";
import { levelOf, readXp } from "../../src/game/account/level";
import { DEFAULT_WORLD, readWorld, type World } from "../../src/game/account/worlds";
import { playsFree, type PurchaseEvent } from "../../src/game/account/purchase";
import { RANKING_SIZE, rankRows, type RankRow } from "../../src/game/account/ranking";
import { COSTUMES, costumeById } from "../../src/game/render/costumes";
import { CLASSES, readClass, type PlayerClass } from "../../src/game/combat/classes";
import { RuleViolation, readSwing, type Pose } from "../../src/game/world/types";
import {
  CHANNEL_CAPACITY, MAX_CHANNELS, channelRoomId, readZone, zoneLayout, type ZoneId, type ZoneLook,
} from "../../src/game/world/zones";
import { solidAt } from "../../src/game/rules/levelLayout";
import { readJumpY } from "../../src/game/rules/movement";
import { maxFeetY } from "../../src/game/rules/platforms";

// One row per purchase the platform reported, so a replayed receipt is noticed.
const PURCHASES_COLLECTION = "purchases";
// One row per account, so the board is a short read instead of a scan over every account.
const RANKING_COLLECTION = "ranking";
// Read a few more rows than the board shows, so a row that has slipped down still lands in order.
const RANKING_READ = RANKING_SIZE * 5;

// Writes this account's line on the board. Called whenever its XP or its name changes; an account
// with no XP yet leaves no row behind.
export async function writeRanking(account: string): Promise<void> {
  const state = await $global.getUserState(account);
  const xp = readXp(state.xp);
  if (xp <= 0) return;
  const row: RankRow = {
    account,
    nickname: typeof state.nickname === "string" ? state.nickname : null,
    xp,
    level: levelOf(xp).level,
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

export async function ownsFullGame(account: string): Promise<boolean> {
  return playsFree(account) || (await $global.getUserState(account)).ownsFullGame === true;
}

// Records a purchase once per receipt and unlocks the game. False when the receipt was seen before.
export async function grantPurchase(event: PurchaseEvent): Promise<boolean> {
  const seen = await $global.getCollectionItems(PURCHASES_COLLECTION, {
    filters: [{ field: "purchaseId", operator: "==", value: event.purchaseId }],
    limit: 1,
  });
  if (seen.length > 0) return false;
  await $global.addCollectionItem(PURCHASES_COLLECTION, { ...event, at: Date.now() });
  await $global.updateUserState(event.account, { ownsFullGame: true });
  return true;
}

// The XP a character has earned.
export async function readAccountXp(account: string): Promise<number> {
  return readXp((await $global.getUserState(account)).xp);
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

// The server an account picked when it last started; the first one for anyone who never picked.
export async function readAccountWorld(account: string): Promise<World> {
  return readWorld((await $global.getUserState(account)).world) ?? DEFAULT_WORLD;
}

// The costume an account picked in the menu, or null for anyone who never picked (their seat decides).
export async function readCostume(account: string): Promise<string | null> {
  const state = await $global.getUserState(account);
  return costumeById(state.costume)?.id ?? null;
}

export async function partyMember(account: string, now: number): Promise<PartyMemberView> {
  const state = await $global.getUserState(account);
  return {
    account,
    nickname: typeof state.nickname === "string" ? state.nickname : null,
    costume: costumeById(state.costume)?.id ?? COSTUMES[0].id,
    playerClass: readClass(state.playerClass) ?? CLASSES[0],
    online: isOnline(state.lastSeenAt, now),
    activity: readActivity(state.activity),
  };
}

// Where a character last stood, so it comes back to the same spot.
export interface Spot { zone: ZoneId; x: number; z: number }

export async function readSavedSpot(account: string): Promise<Spot | null> {
  const raw = (await $global.getUserState(account)).spot as Partial<Spot> | undefined;
  const zone = readZone(raw?.zone);
  if (!zone || typeof raw?.x !== "number" || typeof raw?.z !== "number") return null;
  // A spot that is no longer open ground (the map changed) sends you to the zone's own spawn.
  if (solidAt(zoneLayout(zone), raw.x, raw.z)) return { zone, ...zoneLayout(zone).playerSpawn };
  return { zone, x: raw.x, z: raw.z };
}

export async function saveSpot(account: string, spot: Spot): Promise<void> {
  await $global.updateUserState(account, { spot, zone: spot.zone });
}

// Joins the first channel of a zone on this server that has room, counting from 1. You never
// count against a channel you are already in.
export async function joinChannel(world: string, zone: ZoneId, account: string): Promise<{ roomId: string; channel: number }> {
  return $lock(`rpg-join-${world}-${zone}`, async () => {
    for (let channel = 1; channel <= MAX_CHANNELS; channel++) {
      const roomId = channelRoomId(world, zone, channel);
      const members = await $global.getRoomUserAccounts(roomId);
      if (members.includes(account) || members.length < CHANNEL_CAPACITY) {
        await $global.joinRoom(roomId);
        return { roomId, channel };
      }
    }
    throw new RuleViolation("zone_full");
  });
}

// What the others in a zone see of you: name, class, costume and level.
export async function zoneLook(account: string): Promise<ZoneLook> {
  const state = await $global.getUserState(account);
  return {
    name: typeof state.nickname === "string" ? state.nickname : account,
    costume: costumeById(state.costume)?.id ?? COSTUMES[0].id,
    playerClass: readClass(state.playerClass) ?? CLASSES[0],
    level: levelOf(readXp(state.xp)).level,
  };
}

// Stores a reported pose, held to the zone: inside the map, and no higher than what is underfoot
// plus a jump. Returns where it put you and when your spot was last saved.
export async function writeZonePose(
  roomId: string, account: string, zone: ZoneId, pose: Pose, now: number,
): Promise<{ x: number; z: number; savedAt: number }> {
  const layout = zoneLayout(zone);
  const x = Math.min(Math.max(pose.x, 0), layout.cols * layout.tileSize);
  const z = Math.min(Math.max(pose.z, 0), layout.rows * layout.tileSize);
  const y = Math.min(readJumpY(pose.y), maxFeetY(layout.platforms, x, z));
  const state = await $global.updateRoomUserState(roomId, account, {
    pose: { x, z, yaw: pose.yaw, y, block: pose.block === true, swing: readSwing(pose.swing), skill: readSwing(pose.skill), at: now },
  });
  return { x, z, savedAt: typeof state.savedAt === "number" ? state.savedAt : 0 };
}
