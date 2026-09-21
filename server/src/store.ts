import { isOnline, readFriendLists, type FriendEntry, type FriendSide } from "../../src/game/account/friends";
import {
  readActivity, readInvites, type Party, type PartyInvite, type PartyMemberView,
} from "../../src/game/account/party";
import { levelOf, readXp } from "../../src/game/account/level";
import {
  characterMap, legacyMatchXp, readCharacters, readSpot, type Character, type Spot,
} from "../../src/game/account/characters";
import { DEFAULT_WORLD, readWorld, type World } from "../../src/game/account/worlds";
import { playsFree, type PurchaseEvent } from "../../src/game/account/purchase";
import { RANKING_SIZE, rankRows, type RankRow } from "../../src/game/account/ranking";
import { COSTUMES, costumeById } from "../../src/game/render/costumes";
import { readClass } from "../../src/game/combat/classes";
import { RuleViolation, readSwing, type Pose } from "../../src/game/world/types";
import {
  CHANNEL_CAPACITY, MAX_CHANNELS, channelRoomId, zoneLayout, type ZoneId, type ZoneLook,
} from "../../src/game/world/zones";
import { solidAt } from "../../src/game/rules/levelLayout";
import { readJumpY } from "../../src/game/rules/movement";
import { maxFeetY } from "../../src/game/rules/platforms";

// One row per purchase the platform reported, so a replayed receipt is noticed.
const PURCHASES_COLLECTION = "purchases";
// One row per character, so the board is a short read instead of a scan over every account.
const RANKING_COLLECTION = "ranking";
// Read a few more rows than the board shows, so a row that has slipped down still lands in order.
const RANKING_READ = RANKING_SIZE * 5;

// Writes a character's line on the board. Called whenever its XP or its name changes; a character
// with no XP yet leaves no row behind.
export async function writeRanking(account: string, character: Character): Promise<void> {
  if (character.xp <= 0) return;
  const row: RankRow = { id: character.id, account, nickname: character.name, xp: character.xp, level: levelOf(character.xp).level };
  const [stored] = await $global.getCollectionItems(RANKING_COLLECTION, {
    filters: [{ field: "id", operator: "==", value: character.id }],
    limit: 1,
  });
  if (stored) await $global.updateCollectionItem(RANKING_COLLECTION, { __id: stored.__id, ...row });
  else await $global.addCollectionItem(RANKING_COLLECTION, { ...row });
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

// An account's characters and the active one. Reading never writes: accounts from before characters
// (one nickname and class on the account) read back as one character on the server they last picked,
// with the XP of their old match record, and are saved that way the next time anything changes.
export interface Profile { characters: Character[]; active: Character | null }

export async function readProfile(account: string): Promise<Profile> {
  const state = await $global.getUserState(account);
  const oldXp = state.legacyXpApplied === true ? 0 : legacyMatchXp(state.profile);
  // Saved as characterMap; the first saves were under characters, as an array or however the
  // platform handed that array back (an object keyed by index).
  const saved = isObject(state.characterMap) ? state.characterMap
    : Array.isArray(state.characters) || isObject(state.characters) ? state.characters : null;
  let characters = readCharacters(saved);
  if (!saved && typeof state.nickname === "string" && readClass(state.playerClass)) {
    characters = [{
      // Fixed per account, so two reads of an unsaved account agree on it.
      id: `c-legacy-${account}`,
      world: readWorld(state.world)?.id ?? DEFAULT_WORLD.id,
      name: state.nickname,
      playerClass: readClass(state.playerClass)!,
      costume: costumeById(state.costume)?.id ?? COSTUMES[0].id,
      xp: Math.max(readXp(state.xp), oldXp),
      spot: readSpot(state.spot),
      made: 0,
    }];
  } else if (oldXp > 0) {
    // Moved over before its old XP was carried: the character named like the account's first name
    // (the name claimed before characters existed) gets it.
    const names = (await $global.getCollectionItems(NICKNAMES_COLLECTION, {
      filters: [{ field: "account", operator: "==", value: account }],
    })) as unknown as NicknameItem[];
    const first = names.find((i) => !i.character);
    characters = characters.map((c) => (first && c.name === first.name ? { ...c, xp: Math.max(c.xp, oldXp) } : c));
  }
  const activeId = saved ? state.active : characters[0]?.id;
  return { characters, active: characters.find((c) => c.id === activeId) ?? null };
}

// Saves the characters, and mirrors the active one's name on the account (friends find you by it).
// Call inside withProfileLock.
export async function saveProfile(account: string, characters: Character[], activeId: string | null): Promise<void> {
  const active = characters.find((c) => c.id === activeId) ?? null;
  await $global.updateUserState(account, {
    characterMap: characterMap(characters), active: active?.id ?? null, nickname: active?.name ?? null, legacyXpApplied: true,
  });
}

// One writer at a time for an account's characters, so a spot saved while a character is made or
// picked does not undo the other.
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function withProfileLock<T>(account: string, fn: () => Promise<T>): Promise<T> {
  return $lock(`profile-${account}`, fn);
}

// Changes the active character with `change` and saves.
export async function updateActive(account: string, change: (c: Character) => Character): Promise<Character> {
  return withProfileLock(account, async () => {
    const { characters, active } = await readProfile(account);
    if (!active) throw new RuleViolation("no_character");
    const next = change(active);
    await saveProfile(account, characters.map((c) => (c.id === active.id ? next : c)), next.id);
    return next;
  });
}

export function token(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += Math.floor(Math.random() * 36).toString(36);
  return out;
}

// One item per taken nickname, looked up by its case-insensitive key.
export const NICKNAMES_COLLECTION = "nicknames";

interface NicknameItem { __id: string; key: string; name: string; account: string; character?: string }

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

// Takes a name for a new character. Call inside withNicknameLock.
export async function claimName(account: string, character: string, key: string, name: string): Promise<void> {
  if (await findNickname(key)) throw new RuleViolation("nickname_taken");
  await $global.addCollectionItem(NICKNAMES_COLLECTION, { key, name, account, character });
}

// The active character's name, which is how friends and parties see the account.
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

// The server an account picked when it last started; the first one for anyone who never picked.
export async function readAccountWorld(account: string): Promise<World> {
  return readWorld((await $global.getUserState(account)).world) ?? DEFAULT_WORLD;
}

export async function partyMember(account: string, now: number): Promise<PartyMemberView> {
  const state = await $global.getUserState(account);
  const { active } = await readProfile(account);
  return {
    account,
    nickname: active?.name ?? null,
    costume: active?.costume ?? COSTUMES[0].id,
    playerClass: active?.playerClass ?? "warrior",
    online: isOnline(state.lastSeenAt, now),
    activity: readActivity(state.activity),
  };
}

// Where the active character comes back in. A spot that is no longer open ground (the map changed)
// sends it to the zone's own spawn.
export function returnSpot(spot: Spot | null): Spot | null {
  if (!spot) return null;
  if (solidAt(zoneLayout(spot.zone), spot.x, spot.z)) return { zone: spot.zone, ...zoneLayout(spot.zone).playerSpawn };
  return spot;
}

export async function saveSpot(account: string, spot: Spot): Promise<void> {
  await updateActive(account, (c) => ({ ...c, spot }));
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

// What the others in a zone see of a character: name, class, costume and level.
export function zoneLook(c: Character): ZoneLook {
  return { name: c.name, costume: c.costume, playerClass: c.playerClass, level: levelOf(c.xp).level };
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
