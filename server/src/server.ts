import {
  acceptFriend, isOnline, removeFriend, requestFriend, type FriendSide, type FriendsView,
} from "../../src/game/account/friends";
import { levelOf } from "../../src/game/account/level";
import { CHARACTERS_PER_WORLD, characterView, type Character } from "../../src/game/account/characters";
import { FULL_GAME_PRODUCT, readPurchaseEvent } from "../../src/game/account/purchase";
import { readClass } from "../../src/game/combat/classes";
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
  returnSpot, saveProfile, saveSpot, token, withFriendsLock, withNicknameLock, withPartyLock, withProfileLock, writeFriendSide,
  writeParty, writePartyInvites, writeZonePose, zoneLook,
} from "./store";

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
  const { roomId, channel } = await pickChannel(character.world, zone, account);
  await saveSpot(account, { zone, x, z });
  await $global.updateUserState(account, { activity: "world" });
  return { roomId, zone, channel, x, z };
}

// The caller's channel room, from inside it.
function currentChannel(): { roomId: string; zone: ZoneId } {
  const roomId = $sender.roomId;
  const here = readChannelRoom(roomId);
  if (!here || !roomId) throw new RuleViolation("unavailable");
  return { roomId, zone: here.zone };
}

export class Server {
  async getServerVersion(): Promise<{ protocol: number }> {
    return { protocol: PROTOCOL_VERSION };
  }

  async getAccount(): Promise<AccountView> {
    return accountView($sender.account);
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
    const world = (await readAccountWorld(account)).id;
    await withProfileLock(account, async () => {
      const { characters } = await readProfile(account);
      if (characters.filter((c) => c.world === world).length >= CHARACTERS_PER_WORLD) throw new RuleViolation("character_limit");
      const character: Character = {
        id: `c-${token(10)}`, world, name, playerClass: picked, costume: look.id, xp: 0, spot: null, made: Date.now(),
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
    if (spot && (!ZONES[spot.zone].paid || owned)) return enter(account, character, spot.zone, spot.x, spot.z);
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
    const pose = (await $room.getMyState()).pose;
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
    await $room.updateMyState({
      pose: { x: spot.x, z: spot.z, yaw: 0, y: 0, block: false, swing: 0, skill: 0, at: now },
      look: zoneLook(character),
      savedAt: now,
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
    const saved = await writeZonePose(zone, raw, now);
    const savedAt = (await $room.getMyState()).savedAt;
    if (now - (typeof savedAt === "number" ? savedAt : 0) >= SAVE_SPOT_MS) {
      await saveSpot($sender.account, { zone, x: saved.x, z: saved.z });
      await $room.updateMyState({ savedAt: now }, { returnState: false });
    }
  }

  // Verse8 calls this when someone leaves a room for good (after the reconnect grace period):
  // their last spot in a channel is kept, whatever way they left.
  async onRoomLeave(roomId: string, account: string): Promise<void> {
    const here = readChannelRoom(roomId);
    if (!here) return;
    const pose = (await $room.getUserState(account)).pose;
    const { active } = await readProfile(account);
    if (!active || active.world !== here.world || !isPose(pose)) return;
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
