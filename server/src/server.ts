import {
  acceptFriend, isOnline, removeFriend, requestFriend, type FriendSide, type FriendsView,
} from "../../src/game/account/friends";
import { levelOf } from "../../src/game/account/level";
import {
  GOLD, ITEMS, MAX_STACK, NO_GEAR, addItem, equip, readItemId, sellPrice, unequip, type BagView, type ItemId, type Slot,
} from "../../src/game/account/items";
import { readControls, type Controls } from "../../src/game/account/controls";
import { CHAT_WINDOW_MS, chatAllowed, readChat, type ChatMessage } from "../../src/game/world/chat";
import { rankHitters, rollLoot, xpFor, type MonsterType } from "../../src/game/world/monsters";
import { QUESTS, QUEST_START, countKills, questDone } from "../../src/game/account/quests";
import { ADVANCE_LEVEL, JOBS, readJob } from "../../src/game/combat/jobs";
import { TALK_RANGE, TALK_SLACK, npcSpot, type NpcId } from "../../src/game/world/npcs";
import { CHARACTERS_PER_WORLD, characterView, type Character } from "../../src/game/account/characters";
import { FULL_GAME_PRODUCT, readPurchaseEvent } from "../../src/game/account/purchase";
import { isFreeClass, readClass } from "../../src/game/combat/classes";
import { rankOf, type RankingView } from "../../src/game/account/ranking";
import { parseNickname, type AccountView } from "../../src/game/account/nickname";
import { readWorld } from "../../src/game/account/worlds";
import {
  addInvite, checkInvite, joinParty, kickFromParty, leaveParty, type Party, type PartyView,
} from "../../src/game/account/party";
import { costumeById } from "../../src/game/render/costumes";
import { PROTOCOL_VERSION, RuleViolation, isPose } from "../../src/game/world/types";
import {
  START_ZONE, ZONES, arrivalFrom, portalsOf, readChannelRoom, readZone, zoneLayout, type ZoneEntry, type ZoneId,
} from "../../src/game/world/zones";
import {
  claimName, findNickname, friendEntry, grantPurchase, markSeen, ownsFullGame, partyMember, pickChannel,
  readAccountWorld, readFriendSide, readNickname, readPartyInvites, readPartyOf, readProfile, readRanking,
  returnSpot, saveProfile, saveSpot, token, updateActive, withFriendsLock, withNicknameLock, withPartyLock, withProfileLock,
  writeFriendSide, writeParty, writePartyInvites, writeRanking, writeZonePose, zoneLook,
} from "./store";
import { fightStats, hasMonsters, strike, tickRoom, useSkill, withRoomLock, type HitResult } from "./hunt";

// How often a walking character's spot is saved to the account (the room keeps the live pose).
const SAVE_SPOT_MS = 5_000;

function requireText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new RuleViolation("unavailable");
  return value;
}

// Loads both accounts' friend lists, applies a rule to them and saves whichever side changed.
async function betweenFriends<T>(other: string, rule: (me: FriendSide, them: FriendSide) => T): Promise<T> {
  const account = $sender.account;
  return withFriendsLock(async () => {
    const me = await readFriendSide(account);
    const them = await readFriendSide(other);
    const before = [JSON.stringify(me.lists), JSON.stringify(them.lists)];
    const value = rule(me, them);
    if (JSON.stringify(me.lists) !== before[0]) await writeFriendSide(me);
    if (JSON.stringify(them.lists) !== before[1]) await writeFriendSide(them);
    return value;
  });
}

// Your account as the menu sees it: your server, your characters there and the one you play.
async function accountView(account: string): Promise<AccountView> {
  const state = await $global.getUserState(account);
  // An account that never picked plays on the first server.
  const world = (await readAccountWorld(account)).id;
  const { characters, active } = await readProfile(account);
  const here = characters.filter((c) => c.world === world);
  const mine = active && active.world === world ? characterView(active) : null;
  return {
    account, owned: await ownsFullGame(account), world: readWorld(state.world)?.id ?? null,
    characters: here.map(characterView), active: mine,
    nickname: mine?.name ?? null, xp: mine?.xp ?? 0, level: mine?.level ?? levelOf(0),
    playerClass: mine?.playerClass ?? null, costume: mine?.costume ?? null,
  };
}

// The character you play, on the server you picked.
async function playing(account: string): Promise<Character> {
  const world = (await readAccountWorld(account)).id;
  const { active } = await readProfile(account);
  if (!active || active.world !== world) throw new RuleViolation("no_character");
  return active;
}

// Picks a channel of `zone` for your character and keeps (x, z) as its spot. The client then joins
// the room and calls arrive, which puts you there.
async function enter(account: string, character: Character, zone: ZoneId, x: number, z: number): Promise<ZoneEntry> {
  if (ZONES[zone].paid && !(await ownsFullGame(account))) throw new RuleViolation("not_owned");
  if (levelOf(character.xp).level < ZONES[zone].minLevel) throw new RuleViolation("too_low");
  const { roomId, channel } = await pickChannel(character.world, zone, account);
  await saveSpot(account, { zone, x, z });
  await $global.updateUserState(account, { activity: "world" });
  return { roomId, zone, channel, x, z };
}

// Party members this close to a kill, alive and in the same channel, share its XP and its quest
// count; the XP grows by PARTY_BONUS for every member beyond the first before it is split.
const PARTY_SHARE_RANGE = 30;
const PARTY_BONUS = 0.1;

// The caller's party members standing near them in this room.
async function partyNearby(account: string): Promise<string[]> {
  const stored = await readPartyOf(account);
  const others = stored?.party.members.filter((m) => m !== account) ?? [];
  if (others.length === 0) return [];
  const [me, ...rest]: (Record<string, any> & { account: string })[] = await $room.getUserStates(
    [account, ...others], ["pose", "dead"],
  );
  if (!isPose(me.pose)) return [];
  const at = me.pose;
  return rest
    .filter((u) => isPose(u.pose) && u.dead !== true && Math.hypot(u.pose.x - at.x, u.pose.z - at.z) <= PARTY_SHARE_RANGE)
    .map((u) => u.account);
}

// What one hunter is paid for a blow or skill: XP, gold, items and the kinds it counts toward its
// quest.
interface Pay {
  xp: number;
  gold: number;
  items: ItemId[];
  felled: MonsterType[];
}

// Pays a character (gold onto its account as a Verse8 asset, the rest into the character) and shows
// it in the room: the new XP (a new level heals it to its new, larger health) and the payout itself,
// which its client shows and refreshes the bag on.
async function payHunter(account: string, roomId: string, pay: Pay): Promise<void> {
  // Verse8 mints only to the caller; another hunter's gold is minted here, then handed over.
  if (pay.gold > 0) {
    await $asset.mint(GOLD, pay.gold);
    if (account !== $sender.account) await $asset.transfer(account, GOLD, pay.gold);
  }
  const next = await updateActive(account, (c) => ({
    ...c, xp: c.xp + pay.xp, bag: pay.items.reduce((bag, id) => addItem(bag, id, 1), c.bag), quest: countKills(c.quest, pay.felled),
  }));
  if (pay.xp > 0) await writeRanking(account, next);
  const levelled = levelOf(next.xp).level > levelOf(next.xp - pay.xp).level;
  await withRoomLock(roomId, async () => {
    const stats = fightStats(next);
    await $room.updateUserState(
      account,
      {
        look: zoneLook(next), xp: next.xp, ...(levelled ? { maxHp: stats.maxHp, hp: stats.maxHp } : {}),
        payout: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, xp: pay.xp, gold: pay.gold, items: pay.items },
      },
      { returnState: false },
    );
  });
}

// Pays for what a blow or skill felled. Each monster's XP, gold and drops go to whoever still here
// dealt it the most damage, the XP shared with that hunter's party members close by; everyone here
// who hit it at all counts it toward their quest. Answers with what the caller itself was paid.
async function reward(caller: string, roomId: string, result: HitResult): Promise<HitResult> {
  if (result.kills.length === 0) return result;
  const present = new Set<string>((await $room.getRoomState([])).$users);
  present.add(caller);
  const pays = new Map<string, Pay>();
  const payOf = (account: string) => {
    let pay = pays.get(account);
    if (!pay) pays.set(account, (pay = { xp: 0, gold: 0, items: [], felled: [] }));
    return pay;
  };
  const levels = new Map<string, number>();
  const parties = new Map<string, string[]>();
  for (const kill of result.kills) {
    const hunters = rankHitters(kill.hitters, present);
    const owner = hunters[0] ?? caller;
    if (!levels.has(owner)) {
      const [state] = await $room.getUserStates([owner], ["look"]);
      levels.set(owner, typeof state?.look?.level === "number" ? state.look.level : 1);
    }
    if (!parties.has(owner)) parties.set(owner, await partyNearby(owner));
    const party = parties.get(owner)!;
    const loot = rollLoot(kill.type);
    const xp = xpFor(kill.type, levels.get(owner)!);
    const share = Math.max(1, Math.round((xp * (1 + PARTY_BONUS * party.length)) / (party.length + 1)));
    const own = payOf(owner);
    own.gold += loot.gold;
    own.items.push(...loot.items);
    for (const member of [owner, ...party]) payOf(member).xp += share;
    for (const counted of new Set([owner, ...party, ...hunters])) payOf(counted).felled.push(kill.type);
  }
  for (const [account, pay] of pays) await payHunter(account, roomId, pay);
  const mine = pays.get(caller);
  return { ...result, xp: mine?.xp ?? 0, gold: mine?.gold ?? 0, items: mine?.items ?? [] };
}

async function bagView(character: Character): Promise<BagView> {
  return { gold: await $asset.get(GOLD), bag: character.bag, gear: character.gear, job: character.job, quest: character.quest };
}

// After a change of gear or class: the room carries your new health, what your gear and class add,
// and the look others see.
async function refreshFighter(character: Character): Promise<void> {
  const roomId = $sender.roomId;
  if (!roomId || !readChannelRoom(roomId)) return;
  await withRoomLock(roomId, async () => {
    const mine = await $room.getMyState();
    const stats = fightStats(character);
    const hp = Math.min(typeof mine.hp === "number" ? mine.hp : stats.maxHp, stats.maxHp);
    await $room.updateMyState(
      { maxHp: stats.maxHp, hp, gear: stats.gear, look: zoneLook(character), xp: character.xp },
      { returnState: false },
    );
  });
}

// How many of something to buy or sell: a whole number from 1 to a full stack.
function readCount(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_STACK) throw new RuleViolation("unavailable");
  return value;
}

function readItem(value: unknown): ItemId {
  const id = readItemId(value);
  if (!id) throw new RuleViolation("no_item");
  return id;
}

// The shop and the quests are kept by people in the village: you must be there, standing by them.
async function requireNpc(id: NpcId): Promise<void> {
  if (currentChannel().zone !== START_ZONE) throw new RuleViolation("not_in_village");
  const pose = (await $room.getMyState()).pose;
  const spot = npcSpot(id);
  if (!isPose(pose) || Math.hypot(pose.x - spot.x, pose.z - spot.z) > TALK_RANGE + TALK_SLACK) throw new RuleViolation("not_near");
}

// The caller's channel room, from inside it.
function currentChannel(): { roomId: string; zone: ZoneId } {
  const roomId = $sender.roomId;
  const here = readChannelRoom(roomId);
  if (!here || !roomId) throw new RuleViolation("unavailable");
  return { roomId, zone: here.zone };
}

export class Server {
  // An empty-looking room (nobody calling in) still ticks once a second, so monsters keep moving.
  static $roomTickIdleMs = 1_000;

  async getServerVersion(): Promise<{ protocol: number }> {
    return { protocol: PROTOCOL_VERSION };
  }

  async getAccount(): Promise<AccountView> {
    return accountView($sender.account);
  }

  // How you set up the bar (skills in slots, what auto-battle may use), kept on the account so it
  // follows you to any device; null until first saved.
  async getControls(): Promise<Controls | null> {
    return readControls((await $global.getUserState($sender.account)).controls);
  }

  async saveControls(raw: unknown): Promise<void> {
    const controls = readControls(raw);
    if (!controls) throw new RuleViolation("unavailable");
    await $global.updateUserState($sender.account, { controls });
  }

  // Whether a name is free for a new character (asked while typing it, before the rest is picked).
  async checkName(requested: unknown): Promise<{ free: boolean }> {
    const { key } = parseNickname(requested);
    return { free: !(await findNickname(key)) };
  }

  // A new character on the server you picked, with its class and look fixed for good. It becomes
  // the one you play.
  async createCharacter(requested: unknown, playerClass: unknown, costume: unknown): Promise<AccountView> {
    const account = $sender.account;
    const { name, key } = parseNickname(requested);
    const picked = readClass(playerClass);
    const look = costumeById(costume);
    if (!picked || !look) throw new RuleViolation("unavailable");
    if (!isFreeClass(picked) && !(await ownsFullGame(account))) throw new RuleViolation("not_owned");
    const world = (await readAccountWorld(account)).id;
    await withProfileLock(account, async () => {
      const { characters } = await readProfile(account);
      if (characters.filter((c) => c.world === world).length >= CHARACTERS_PER_WORLD) throw new RuleViolation("character_limit");
      const character: Character = {
        id: `c-${token(10)}`, world, name, playerClass: picked, costume: look.id, xp: 0, spot: null, made: Date.now(),
        // A start: a few potions.
        bag: { potion_small: 3 }, gear: NO_GEAR, job: null, quest: QUEST_START,
      };
      await withNicknameLock(() => claimName(account, character.id, key, name));
      await saveProfile(account, [...characters, character], character.id);
    });
    return accountView(account);
  }

  // Plays another of your characters on this server.
  async selectCharacter(id: unknown): Promise<AccountView> {
    const account = $sender.account;
    const world = (await readAccountWorld(account)).id;
    await withProfileLock(account, async () => {
      const { characters } = await readProfile(account);
      const picked = characters.find((c) => c.id === id && c.world === world);
      if (!picked) throw new RuleViolation("no_character");
      await saveProfile(account, characters, picked.id);
    });
    return accountView(account);
  }

  // Your character's level, where it sits on the board, and the board itself.
  async getRanking(): Promise<RankingView> {
    const account = $sender.account;
    const { active } = await readProfile(account);
    const xp = active?.xp ?? 0;
    const board = await readRanking();
    return { xp, level: levelOf(xp), rank: active ? rankOf(board, active.id) : null, board };
  }

  // Marks you online (the menu calls it every HEARTBEAT_MS) and returns your lists with names and presence.
  async syncFriends(): Promise<FriendsView> {
    const account = $sender.account;
    const now = Date.now();
    await markSeen(account, now);
    const { lists } = await readFriendSide(account);
    const entries = (accounts: string[]) => Promise.all(accounts.map((a) => friendEntry(a, now)));
    return { friends: await entries(lists.friends), incoming: await entries(lists.incoming), outgoing: await entries(lists.outgoing) };
  }

  async requestFriend(nickname: unknown): Promise<{ status: "requested" | "accepted" }> {
    if (!(await readNickname($sender.account))) throw new RuleViolation("unavailable");
    let key: string;
    try {
      key = parseNickname(nickname).key;
    } catch {
      throw new RuleViolation("friend_not_found");
    }
    const target = await findNickname(key);
    if (!target) throw new RuleViolation("friend_not_found");
    return { status: await betweenFriends(target.account, requestFriend) };
  }

  async acceptFriend(account: unknown): Promise<void> {
    await betweenFriends(requireText(account), acceptFriend);
  }

  async removeFriend(account: unknown): Promise<void> {
    await betweenFriends(requireText(account), removeFriend);
  }

  // Verse8 calls this when a VX Shop purchase completes. It may call again with the same receipt, so
  // each purchaseId unlocks once; a replay still answers success so the platform stops retrying.
  async $onItemPurchased(raw: unknown): Promise<{ success: boolean; code: string }> {
    const event = readPurchaseEvent(raw);
    if (!event) return { success: false, code: "invalid_event" };
    if (event.productId !== FULL_GAME_PRODUCT) return { success: false, code: "unknown_product" };
    const granted = await $lock(`purchase:${event.purchaseId}`, () => grantPurchase(event));
    return { success: true, code: granted ? "granted" : "already_granted" };
  }

  // The server you play on, picked each time you start.
  async setWorld(id: unknown): Promise<AccountView> {
    const world = readWorld(id);
    if (!world) throw new RuleViolation("unavailable");
    const account = $sender.account;
    await $global.updateUserState(account, { world: world.id });
    // The characters there stay as they were; the last one played there comes back active.
    await withProfileLock(account, async () => {
      const { characters, active } = await readProfile(account);
      if (active?.world !== world.id) {
        await saveProfile(account, characters, characters.find((c) => c.world === world.id)?.id ?? null);
      }
    });
    return accountView(account);
  }

  // Into the world: back where you last stood, or in the village the first time (and when the
  // zone you were in has since locked).
  async enterWorld(): Promise<ZoneEntry> {
    const account = $sender.account;
    const character = await playing(account);
    const spot = returnSpot(character.spot);
    const owned = await ownsFullGame(account);
    const level = levelOf(character.xp).level;
    if (spot && (!ZONES[spot.zone].paid || owned) && level >= ZONES[spot.zone].minLevel) {
      return enter(account, character, spot.zone, spot.x, spot.z);
    }
    const home = zoneLayout(START_ZONE).playerSpawn;
    return enter(account, character, START_ZONE, home.x, home.z);
  }

  // Through a portal: only to a zone next to the one you are in, and only while standing at that
  // zone's portal.
  async travel(to: unknown): Promise<ZoneEntry> {
    const account = $sender.account;
    const target = readZone(to);
    const here = readChannelRoom($sender.roomId);
    if (!target || !here) throw new RuleViolation("no_zone");
    const portal = portalsOf(here.zone).find((p) => p.to === target);
    if (!portal) throw new RuleViolation("no_zone");
    const mine = await $room.getMyState();
    if (mine.dead === true) throw new RuleViolation("unavailable");
    const pose = mine.pose;
    if (!isPose(pose) || Math.hypot(pose.x - portal.x, pose.z - portal.z) > zoneLayout(here.zone).tileSize) {
      throw new RuleViolation("not_near");
    }
    const at = arrivalFrom(target, here.zone);
    return enter(account, await playing(account), target, at.x, at.z);
  }

  // After the client has joined the room enterWorld or travel picked: stands your character at
  // its spot for everyone in the room to see.
  async arrive(): Promise<{ x: number; z: number }> {
    const account = $sender.account;
    const { zone } = currentChannel();
    const character = await playing(account);
    // The spot enter kept; a room of another zone (a stale join) starts at that zone's spawn.
    const spot = character.spot?.zone === zone ? character.spot : { zone, ...zoneLayout(zone).playerSpawn };
    const now = Date.now();
    // Every arrival is whole: full health, nothing on cooldown.
    const { maxHp, gear } = fightStats(character);
    await $room.updateMyState({
      pose: { x: spot.x, z: spot.z, yaw: 0, y: 0, block: false, swing: 0, skill: 0, at: now },
      look: zoneLook(character),
      savedAt: now,
      xp: character.xp, hp: maxHp, maxHp, gear, dead: false, hitAt: 0, strikeReadyAt: 0, skillReady: {},
    });
    return { x: spot.x, z: spot.z };
  }

  // Back to the menu: keeps where you stood. The client leaves the room itself.
  async leaveWorld(): Promise<void> {
    const account = $sender.account;
    const here = readChannelRoom($sender.roomId);
    if (here) {
      const pose = (await $room.getMyState()).pose;
      if (isPose(pose)) await saveSpot(account, { zone: here.zone, x: pose.x, z: pose.z });
    }
    await $global.updateUserState(account, { activity: "menu" });
  }

  // Where you are in your zone. The room carries it to everyone there; the account keeps a copy
  // every SAVE_SPOT_MS so you come back to the same spot.
  async reportPose(raw: unknown): Promise<void> {
    if (!isPose(raw)) throw new RuleViolation("unavailable");
    const { zone } = currentChannel();
    const now = Date.now();
    const mine = await $room.getMyState();
    // The fallen stay where they fell.
    if (mine.dead === true) return;
    const at: unknown = mine.pose?.at;
    const last = isPose(mine.pose) && typeof at === "number" ? { x: mine.pose.x, z: mine.pose.z, at } : null;
    const saved = await writeZonePose(zone, raw, now, last);
    const savedAt = mine.savedAt;
    if (now - (typeof savedAt === "number" ? savedAt : 0) >= SAVE_SPOT_MS) {
      await saveSpot($sender.account, { zone, x: saved.x, z: saved.z });
      await $room.updateMyState({ savedAt: now }, { returnState: false });
    }
  }

  // A line said in your channel: tidied, held to the chat's pace, and sent to everyone in the room
  // (you too) with the name the room shows for you. Answers with the line as it went out.
  async say(raw: unknown): Promise<ChatMessage> {
    const text = readChat(raw);
    if (text === null) throw new RuleViolation("unavailable");
    currentChannel();
    const now = Date.now();
    const mine = await $room.getMyState();
    const said: number[] = Array.isArray(mine.chatAt) ? mine.chatAt.filter((t: unknown): t is number => typeof t === "number") : [];
    if (!chatAllowed(said, now)) throw new RuleViolation("too_fast");
    await $room.updateMyState({ chatAt: [...said.filter((t) => now - t < CHAT_WINDOW_MS), now] }, { returnState: false });
    const name = typeof mine.look?.name === "string" ? mine.look.name : "";
    const message: ChatMessage = { account: $sender.account, name, text, at: now };
    await $room.broadcastToRoom("chat", message);
    return message;
  }

  // Your attack on a monster, facing yaw; the server checks reach, facing and your weapon's pace.
  async strike(monsterId: unknown, yaw?: unknown): Promise<HitResult> {
    const { roomId, zone } = currentChannel();
    const result = await withRoomLock(roomId, () => strike(zone, $sender.account, monsterId, yaw, Date.now()));
    return reward($sender.account, roomId, result);
  }

  // Your class's skill, no sooner than its cooldown allows.
  async useSkill(slot?: unknown, yaw?: unknown): Promise<HitResult> {
    const { roomId, zone } = currentChannel();
    const result = await withRoomLock(roomId, () => useSkill(zone, $sender.account, slot, yaw, Date.now()));
    return reward($sender.account, roomId, result);
  }

  // Your gold, and your active character's bag and gear.
  async getBag(): Promise<BagView> {
    return bagView(await playing($sender.account));
  }

  // Wears an item from the bag (what was in its slot goes back in the bag).
  async equipItem(id: unknown): Promise<BagView> {
    const item = readItem(id);
    const account = $sender.account;
    await playing(account);
    const next = await updateActive(account, (c) => ({ ...c, ...equip(c.bag, c.gear, item) }));
    await refreshFighter(next);
    return bagView(next);
  }

  async unequipItem(slot: unknown): Promise<BagView> {
    if (slot !== "weapon" && slot !== "armor") throw new RuleViolation("unavailable");
    const account = $sender.account;
    await playing(account);
    const next = await updateActive(account, (c) => ({ ...c, ...unequip(c.bag, c.gear, slot as Slot) }));
    await refreshFighter(next);
    return bagView(next);
  }

  // Drinks a potion from the bag, in the world and standing.
  async drinkPotion(id: unknown): Promise<BagView> {
    const item = readItem(id);
    if (ITEMS[item].kind !== "potion") throw new RuleViolation("unavailable");
    const account = $sender.account;
    const { roomId } = currentChannel();
    if ((await $room.getMyState()).dead === true) throw new RuleViolation("unavailable");
    const next = await updateActive(account, (c) => ({ ...c, bag: addItem(c.bag, item, -1) }));
    await withRoomLock(roomId, async () => {
      const mine = await $room.getMyState();
      if (mine.dead === true || typeof mine.hp !== "number" || typeof mine.maxHp !== "number") return;
      await $room.updateMyState({ hp: Math.min(mine.maxHp, mine.hp + ITEMS[item].heal) }, { returnState: false });
    });
    return bagView(next);
  }

  // The village shop: gold for items, at the listed price.
  async buyItem(id: unknown, count?: unknown): Promise<BagView> {
    const item = readItem(id);
    const n = readCount(count);
    await requireNpc("merchant");
    const price = ITEMS[item].price;
    if (price === null) throw new RuleViolation("unavailable");
    const account = $sender.account;
    await playing(account);
    const cost = price * n;
    if (!(await $asset.has(GOLD, cost))) throw new RuleViolation("not_enough_gold");
    await $asset.burn(GOLD, cost);
    try {
      return bagView(await updateActive(account, (c) => ({ ...c, bag: addItem(c.bag, item, n) })));
    } catch (error) {
      await $asset.mint(GOLD, cost);
      throw error;
    }
  }

  // Sells items from the bag back to the shop for half their price.
  async sellItem(id: unknown, count?: unknown): Promise<BagView> {
    const item = readItem(id);
    const n = readCount(count);
    await requireNpc("merchant");
    const account = $sender.account;
    await playing(account);
    const next = await updateActive(account, (c) => ({ ...c, bag: addItem(c.bag, item, -n) }));
    await $asset.mint(GOLD, sellPrice(item) * n);
    return bagView(next);
  }

  // Advancement (전직): from ADVANCE_LEVEL, one of the two paths of your class, for good.
  async advance(id: unknown): Promise<BagView> {
    const job = readJob(id);
    const account = $sender.account;
    await playing(account);
    const next = await updateActive(account, (c) => {
      if (!job || JOBS[job].playerClass !== c.playerClass || c.job) throw new RuleViolation("unavailable");
      if (levelOf(c.xp).level < ADVANCE_LEVEL) throw new RuleViolation("too_low");
      return { ...c, job };
    });
    await refreshFighter(next);
    return bagView(next);
  }

  // Claims the finished quest's reward (XP, gold, items) and moves on to the next one.
  async claimQuest(): Promise<BagView> {
    const account = $sender.account;
    await playing(account);
    await requireNpc("elder");
    let paid = 0;
    const next = await updateActive(account, (c) => {
      if (!questDone(c.quest)) throw new RuleViolation("quest_unfinished");
      const quest = QUESTS[c.quest.index];
      paid = quest.gold;
      return {
        ...c,
        xp: c.xp + quest.xp,
        bag: quest.items.reduce((bag, item) => addItem(bag, item.id, item.n), c.bag),
        quest: { index: c.quest.index + 1, count: 0 },
      };
    });
    if (paid > 0) await $asset.mint(GOLD, paid);
    await writeRanking(account, next);
    await refreshFighter(next);
    return bagView(next);
  }

  // Fallen: back to the village, whole again (arrive heals).
  async respawn(): Promise<ZoneEntry> {
    const account = $sender.account;
    if ((await $room.getMyState()).dead !== true) throw new RuleViolation("unavailable");
    const home = zoneLayout(START_ZONE).playerSpawn;
    return enter(account, await playing(account), START_ZONE, home.x, home.z);
  }

  // Every room tick (Verse8 runs it about every 200 ms): the monsters of a hunting zone move and fight.
  async $roomTick(delta: number, roomId: string): Promise<void> {
    const here = readChannelRoom(roomId);
    if (!here || !hasMonsters(here.zone)) return;
    await withRoomLock(roomId, () => tickRoom(here.zone, delta, Date.now()));
  }

  // Verse8 calls this when someone leaves a room for good (after the reconnect grace period):
  // their last spot in a channel is kept, whatever way they left.
  async onRoomLeave(roomId: string, account: string): Promise<void> {
    const here = readChannelRoom(roomId);
    if (!here) return;
    const pose = (await $room.getUserState(account)).pose;
    const { active } = await readProfile(account);
    // Gone on through a portal: the spot already points into the next zone, and must stay there.
    if (!active || active.world !== here.world || !isPose(pose) || active.spot?.zone !== here.zone) return;
    await saveSpot(account, { zone: here.zone, x: pose.x, z: pose.z });
  }

  // Marks you online (and on the menu or in the world), drops party members who went quiet,
  // and returns your party and your invites.
  async syncParty(activity?: unknown): Promise<PartyView> {
    const account = $sender.account;
    const now = Date.now();
    await markSeen(account, now);
    if (activity === "menu" || activity === "world") await $global.updateUserState(account, { activity });
    return withPartyLock(async () => {
      let stored = await readPartyOf(account);
      if (stored) {
        let party: Party | null = stored.party;
        for (const member of stored.party.members) {
          if (party && member !== account && !isOnline((await $global.getUserState(member)).lastSeenAt, now)) {
            party = leaveParty(party, member);
          }
        }
        if (party !== stored.party) {
          await writeParty(stored, party);
          stored = party ? { id: stored.id, party } : null;
        }
      }
      const invites = await readPartyInvites(account, now);
      return {
        party: stored && {
          leader: stored.party.leader,
          members: await Promise.all(stored.party.members.map((m) => partyMember(m, now))),
        },
        invites: await Promise.all(invites.map(async (i) => ({ account: i.from, nickname: await readNickname(i.from) }))),
      };
    });
  }

  async inviteToParty(target: unknown): Promise<void> {
    const to = requireText(target);
    const account = $sender.account;
    const now = Date.now();
    await withPartyLock(async () => {
      const stored = await readPartyOf(account);
      checkInvite(stored?.party ?? null, to, (await readFriendSide(account)).lists.friends);
      await writePartyInvites(to, addInvite(await readPartyInvites(to, now), account, now));
    });
  }

  async acceptPartyInvite(from: unknown): Promise<void> {
    const inviter = requireText(from);
    const account = $sender.account;
    const now = Date.now();
    await withPartyLock(async () => {
      const invites = await readPartyInvites(account, now);
      if (!invites.some((i) => i.from === inviter)) throw new RuleViolation("no_invite");
      const theirs = await readPartyOf(inviter);
      const mine = await readPartyOf(account);
      if (!theirs || theirs.id !== mine?.id) {
        const joined = joinParty(theirs?.party ?? null, inviter, account);
        if (mine) await writeParty(mine, leaveParty(mine.party, account));
        await writeParty(theirs, joined);
      }
      await writePartyInvites(account, invites.filter((i) => i.from !== inviter));
    });
  }

  async declinePartyInvite(from: unknown): Promise<void> {
    const inviter = requireText(from);
    const account = $sender.account;
    await withPartyLock(async () => {
      const invites = await readPartyInvites(account, Date.now());
      await writePartyInvites(account, invites.filter((i) => i.from !== inviter));
    });
  }

  async leaveParty(): Promise<void> {
    const account = $sender.account;
    await withPartyLock(async () => {
      const mine = await readPartyOf(account);
      if (mine) await writeParty(mine, leaveParty(mine.party, account));
    });
  }

  async kickFromParty(target: unknown): Promise<void> {
    const who = requireText(target);
    const account = $sender.account;
    await withPartyLock(async () => {
      const mine = await readPartyOf(account);
      if (!mine) throw new RuleViolation("unavailable");
      await writeParty(mine, kickFromParty(mine.party, account, who));
    });
  }
}
