import {
  acceptFriend, isOnline, removeFriend, requestFriend, type FriendSide, type FriendsView,
} from "../../src/game/account/friends";
import { levelOf } from "../../src/game/account/level";
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
  claimNickname, findNickname, friendEntry, grantPurchase, joinChannel, markSeen, ownsFullGame, partyMember,
  readAccountWorld, readAccountXp, readFriendSide, readNickname, readPartyInvites, readPartyOf, readRanking,
  readSavedSpot, saveSpot, withFriendsLock, withNicknameLock, withPartyLock, writeFriendSide, writeParty,
  writePartyInvites, writeRanking, writeZonePose, zoneLook,
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

// Your account as the menu sees it: your character and how far along it is.
async function accountView(account: string, nickname: string | null): Promise<AccountView> {
  const state = await $global.getUserState(account);
  const xp = await readAccountXp(account);
  return {
    account, nickname, xp, level: levelOf(xp), owned: await ownsFullGame(account),
    world: readWorld(state.world)?.id ?? null,
    playerClass: readClass(state.playerClass),
    costume: costumeById(state.costume)?.id ?? null,
  };
}

// Puts you in a channel of `zone` at (x, z): the first channel of your server with room to spare.
async function enter(account: string, zone: ZoneId, x: number, z: number): Promise<ZoneEntry> {
  if (ZONES[zone].paid && !(await ownsFullGame(account))) throw new RuleViolation("not_owned");
  const world = (await readAccountWorld(account)).id;
  const { roomId, channel } = await joinChannel(world, zone, account);
  const now = Date.now();
  await $global.updateRoomUserState(roomId, account, {
    pose: { x, z, yaw: 0, y: 0, block: false, swing: 0, skill: 0, at: now },
    look: await zoneLook(account),
    savedAt: now,
  });
  await saveSpot(account, { zone, x, z });
  await $global.updateUserState(account, { activity: "world" });
  return { roomId, zone, channel, x, z };
}

export class Server {
  async getServerVersion(): Promise<{ protocol: number }> {
    return { protocol: PROTOCOL_VERSION };
  }

  async getAccount(): Promise<AccountView> {
    const account = $sender.account;
    return accountView(account, await readNickname(account));
  }

  async setNickname(requested: unknown): Promise<AccountView> {
    const { name, key } = parseNickname(requested);
    const account = $sender.account;
    await withNicknameLock(() => claimNickname(account, key, name));
    // The board carries names, so it hears about a rename too.
    await writeRanking(account);
    return accountView(account, name);
  }

  // Your level, where you sit on the board, and the board itself.
  async getRanking(): Promise<RankingView> {
    const account = $sender.account;
    const xp = await readAccountXp(account);
    const board = await readRanking();
    return { xp, level: levelOf(xp), rank: rankOf(board, account), board };
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
    return accountView(account, await readNickname(account));
  }

  async setClass(id: unknown): Promise<void> {
    const picked = readClass(id);
    if (!picked) throw new RuleViolation("unavailable");
    await $global.updateUserState($sender.account, { playerClass: picked });
  }

  async setCostume(id: unknown): Promise<void> {
    const costume = costumeById(id);
    if (!costume) throw new RuleViolation("unavailable");
    await $global.updateUserState($sender.account, { costume: costume.id });
  }

  // Into the world: back where you last stood, or in the village the first time (and when the
  // zone you were in has since locked).
  async enterWorld(): Promise<ZoneEntry> {
    const account = $sender.account;
    const spot = await readSavedSpot(account);
    const owned = await ownsFullGame(account);
    if (spot && (!ZONES[spot.zone].paid || owned)) return enter(account, spot.zone, spot.x, spot.z);
    const home = zoneLayout(START_ZONE).playerSpawn;
    return enter(account, START_ZONE, home.x, home.z);
  }

  // Through a portal: only to a zone next to the one you are in, and only while standing at that
  // zone's portal.
  async travel(to: unknown): Promise<ZoneEntry> {
    const account = $sender.account;
    const target = readZone(to);
    const roomId = $sender.roomId;
    const here = readChannelRoom(roomId);
    if (!target || !here || !roomId) throw new RuleViolation("no_zone");
    const portal = portalsOf(here.zone).find((p) => p.to === target);
    if (!portal) throw new RuleViolation("no_zone");
    const pose = (await $global.getRoomUserState(roomId, account)).pose;
    if (!isPose(pose) || Math.hypot(pose.x - portal.x, pose.z - portal.z) > zoneLayout(here.zone).tileSize) {
      throw new RuleViolation("not_near");
    }
    const at = arrivalFrom(target, here.zone);
    return enter(account, target, at.x, at.z);
  }

  async leaveWorld(): Promise<void> {
    const account = $sender.account;
    const roomId = $sender.roomId;
    const here = readChannelRoom(roomId);
    if (here && roomId) {
      const pose = (await $global.getRoomUserState(roomId, account)).pose;
      if (isPose(pose)) await saveSpot(account, { zone: here.zone, x: pose.x, z: pose.z });
      await $global.leaveRoom();
    }
    await $global.updateUserState(account, { activity: "menu" });
  }

  // Where you are in your zone. The room carries it to everyone there; the account keeps a copy
  // every SAVE_SPOT_MS so you come back to the same spot.
  async reportPose(raw: unknown): Promise<void> {
    const roomId = $sender.roomId;
    const here = readChannelRoom(roomId);
    if (!here || !roomId || !isPose(raw)) throw new RuleViolation("unavailable");
    const account = $sender.account;
    const now = Date.now();
    const saved = await writeZonePose(roomId, account, here.zone, raw, now);
    if (now - saved.savedAt >= SAVE_SPOT_MS) {
      await saveSpot(account, { zone: here.zone, x: saved.x, z: saved.z });
      await $global.updateRoomUserState(roomId, account, { savedAt: now });
    }
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
