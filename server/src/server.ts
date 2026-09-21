import {
  acceptFriend, isOnline, removeFriend, requestFriend, type FriendSide, type FriendsView,
} from "../../src/game/account/friends";
import { levelOf, xpOf } from "../../src/game/account/level";
import { FULL_GAME_PRODUCT, readPurchaseEvent } from "../../src/game/account/purchase";
import { readClass } from "../../src/game/match/classes";
import { rankOf, type StatsView } from "../../src/game/account/ranking";
import { parseNickname, type AccountView } from "../../src/game/account/nickname";
import { readWorld } from "../../src/game/account/worlds";
import {
  addInvite, checkInvite, joinParty, kickFromParty, leaveParty, readActivity, readPartyMatch, type Party,
  type PartyView,
} from "../../src/game/account/party";
import { costumeById } from "../../src/game/render/costumes";
import { MATCH_PLAYERS, PROTOCOL_VERSION } from "../../src/game/match/constants";
import {
  applyMonsterPoses, monsterAttack, reachExit, strikeMonster, useSkill, type MonsterPoseUpdate,
} from "../../src/game/match/damage";
import {
  createLobby, fillWithBots, isBot, joinLobby, leaveLobby, matchHost, monsterSpawnsFor, startMatch,
} from "../../src/game/match/lifecycle";
import { readProfile } from "../../src/game/match/profile";
import { advanceObjectives, operateObjective, skipToStage } from "../../src/game/match/objectives";
import { markLeft, resolveOutcome, settleResults } from "../../src/game/match/outcome";
import { releasePossession, startPossession } from "../../src/game/match/possession";
import {
  RuleViolation, STAGES, type MatchEvent, type PublicMatch, type SecretMatch, type Stage,
} from "../../src/game/match/types";
import { privateView, type PrivateView } from "../../src/game/match/view";
import { stepVote } from "../../src/game/match/vote";
import {
  LEVEL, claimNickname, createSecret, deleteSecret, findNickname, friendEntry, isPose, listLobbies, markSeen, newRoomId,
  partyMember, readAccountWorld, readCostume, readPlayerClass, readFriendSide, readMatch, readNickname, readPartyInvites, readPartyOf, readPose, readPoses,
  readRanking, writeRanking, grantPurchase, ownsFullGame,
  readSecret, readXp, saveResults, withFriendsLock, withMatchmakingLock, withNicknameLock, withPartyLock, withRoomLock,
  writeFriendSide, writeMatch, writeParty, writePartyInvites, writePose, writeSecret,
} from "./store";

const SPAWNS = monsterSpawnsFor(LEVEL);

interface RoomContext {
  roomId: string;
  account: string;
  match: PublicMatch;
  secret: SecretMatch | null;
  now: number;
  events: MatchEvent[];
}

export interface MatchSnapshot {
  roomId: string;
  serverNow: number;
  match: PublicMatch;
  you: PrivateView;
}

function clock(match: PublicMatch): number {
  return Date.now() + match.devClockOffsetMs;
}

function currentRoom(): string {
  const roomId = $sender.roomId;
  if (typeof roomId !== "string" || roomId.length === 0) throw new RuleViolation("unavailable");
  return roomId;
}

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

// Your account as the menu sees it: your name and the level your finished matches add up to.
async function accountView(account: string, nickname: string | null): Promise<AccountView> {
  const xp = await readXp(account);
  const world = readWorld((await $global.getUserState(account)).world)?.id ?? null;
  return { account, nickname, xp, level: levelOf(xp), owned: await ownsFullGame(account), world };
}

// Who findMatch seats: you alone, or your party if you lead one and everyone is back at the menu.
async function partySeats(account: string, now: number): Promise<string[]> {
  const stored = await readPartyOf(account);
  if (!stored) return [account];
  if (stored.party.leader !== account) throw new RuleViolation("not_leader");
  for (const member of stored.party.members) {
    if (member === account) continue;
    const state = await $global.getUserState(member);
    if (!isOnline(state.lastSeenAt, now) || readActivity(state.activity) !== "menu") throw new RuleViolation("party_busy");
  }
  return stored.party.members;
}

function requireLive(ctx: RoomContext): SecretMatch {
  if (ctx.match.phase !== "playing" || !ctx.secret) throw new RuleViolation("not_playing");
  return ctx.secret;
}

function requireTestAccount(): void {
  if (!$sender.account.startsWith("test-")) throw new RuleViolation("unavailable");
}

// Every in-room request: lock, load, apply rules, settle the clock, save, then notify.
// `account` is who acts: the caller, or a bot the host is acting for.
async function inRoom<T>(work: (ctx: RoomContext) => T | Promise<T>, account: string = $sender.account): Promise<T> {
  const roomId = currentRoom();
  return withRoomLock(roomId, async () => {
    const match = await readMatch(roomId);
    if (!match) throw new RuleViolation("unavailable");
    const ctx: RoomContext = {
      roomId, account, match, secret: await readSecret(match), now: clock(match), events: [],
    };
    const value = await work(ctx);
    await startWithBots(ctx.match, ctx.now);
    advanceObjectives(ctx.match, null, LEVEL, ctx.now);
    ctx.events.push(...resolveOutcome(ctx.match, ctx.secret, ctx.now));
    await commit(ctx);
    notify(ctx);
    return value;
  });
}

// Once the lobby has waited long enough, bots take the empty seats and the match starts.
async function startWithBots(match: PublicMatch, now: number): Promise<boolean> {
  if (!fillWithBots(match, now)) return false;
  match.secretRef = await createSecret(startMatch(match, now, Math.random, SPAWNS));
  return true;
}

// What one seat can do in a match. The public methods run these for the caller; botCall runs
// the same ones for a bot, on behalf of the host whose client drives the bots.
const seatActions = {
  async getMatchState(account: string): Promise<MatchSnapshot> {
    return inRoom((ctx) => ({
      roomId: ctx.roomId,
      serverNow: ctx.now,
      match: ctx.match,
      you: privateView(ctx.match, ctx.secret, ctx.account),
    }), account);
  },

  async syncMatch(account: string): Promise<void> {
    await inRoom(() => undefined, account);
  },

  async reportPose(account: string, pose: unknown): Promise<void> {
    const roomId = currentRoom();
    if (!isPose(pose)) throw new RuleViolation("unavailable");
    await writePose(roomId, account, pose, Date.now());
  },

  async strikeMonster(account: string, monsterId: unknown): Promise<void> {
    const id = requireText(monsterId);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const poses = await readPoses(ctx.roomId, ctx.match.players);
      ctx.events.push(...strikeMonster(ctx.match, secret, ctx.account, id, poses[ctx.account] ?? null, poses, ctx.now));
    }, account);
  },

  async useSkill(account: string): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const poses = await readPoses(ctx.roomId, ctx.match.players);
      ctx.events.push(...useSkill(ctx.match, secret, ctx.account, poses[ctx.account] ?? null, poses, ctx.now));
    }, account);
  },

  async interact(account: string): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      operateObjective(ctx.match, secret, ctx.account, pose, LEVEL, ctx.now);
    }, account);
  },

  async escape(account: string): Promise<void> {
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const pose = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...reachExit(ctx.match, secret, ctx.account, pose, LEVEL.exits, ctx.now));
    }, account);
  },
};

async function commit(ctx: RoomContext): Promise<void> {
  const { roomId, match, secret } = ctx;
  if (secret && match.phase === "ended" && match.secretRef) {
    const results = settleResults(match, secret);
    match.results = results;
    await saveResults(roomId, results);
    await deleteSecret(match);
    match.secretRef = null;
  } else if (secret) {
    await writeSecret(match, secret);
  }
  await writeMatch(roomId, match);
}

function notify(ctx: RoomContext): void {
  const { match, secret, events } = ctx;
  const privates = new Set<string>();
  for (const event of events) {
    switch (event.type) {
      case "private":
        privates.add(event.account);
        break;
      case "pain":
        for (const to of event.to) $room.sendMessageToUser("pain", to, { x: event.x, z: event.z });
        break;
      case "possession":
        $room.broadcastToRoom("possession", { monsterId: event.monsterId, active: event.active, endsAt: event.endsAt });
        break;
      case "ended":
        $room.broadcastToRoom("ended", { result: match.result, results: match.results });
        break;
    }
  }
  for (const account of privates) $room.sendMessageToUser("private", account, privateView(match, secret, account));
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

  // Your own record, where you sit on the board, and the board itself.
  async getStats(): Promise<StatsView> {
    const account = $sender.account;
    const profile = readProfile((await $global.getUserState(account)).profile);
    const xp = xpOf(profile);
    const board = await readRanking();
    return { profile, xp, level: levelOf(xp), rank: rankOf(board, account), board };
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

  // Marks you online (and at the menu or in a match), drops party members who went quiet,
  // and returns your party, your invites and any match your leader seated you in.
  async syncParty(activity?: unknown): Promise<PartyView> {
    const account = $sender.account;
    const now = Date.now();
    await markSeen(account, now);
    if (activity === "menu" || activity === "match") await $global.updateUserState(account, { activity });
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
        match: readPartyMatch((await $global.getUserState(account)).partyMatch, now),
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

  // Seats you, or as a party leader your whole party, in one lobby; the others follow with joinPartyMatch.
  async findMatch(): Promise<{ roomId: string }> {
    const account = $sender.account;
    const now = Date.now();
    const seats = await partySeats(account, now);
    // Online play is the paid game. A leader who owns it brings the whole party along.
    if (!(await ownsFullGame(account))) throw new RuleViolation("not_owned");
    // The leader's server decides where the whole party plays.
    const world = (await readAccountWorld(account)).id;
    const roomId = await withMatchmakingLock(async () => {
      const lobbies = await listLobbies(world);
      const missing = (players: string[]) => seats.filter((s) => !players.includes(s)).length;
      const target = lobbies.find((l) => missing(l.match.players) === 0)
        ?? lobbies.find((l) => l.match.players.length + missing(l.match.players) <= MATCH_PLAYERS);
      const id = target?.roomId ?? newRoomId(now, world);
      await $global.joinRoom(id);
      await withRoomLock(id, async () => {
        const match = (await readMatch(id)) ?? createLobby(now);
        for (const seat of seats) {
          joinLobby(match, seat);
          // The look and the name are copied in as you sit down, so a later change never repaints a
          // live match.
          const look = await readCostume(seat);
          if (look) match.looks[seat] = look;
          const name = await readNickname(seat);
          if (name) match.names[seat] = name;
          const picked = await readPlayerClass(seat);
          if (picked) match.classes[seat] = picked;
        }
        if (match.players.length === MATCH_PLAYERS) {
          match.secretRef = await createSecret(startMatch(match, clock(match), Math.random, SPAWNS));
        }
        await writeMatch(id, match);
      });
      return id;
    });
    for (const member of seats) {
      if (member !== account) await $global.updateUserState(member, { partyMatch: { roomId, at: now } });
    }
    return { roomId };
  }

  // Follows your party leader into the room they seated you in.
  async joinPartyMatch(): Promise<{ roomId: string }> {
    const account = $sender.account;
    const seat = readPartyMatch((await $global.getUserState(account)).partyMatch, Date.now());
    const match = seat ? await readMatch(seat.roomId) : null;
    if (!seat || !match || match.phase === "ended" || !match.players.includes(account)) {
      throw new RuleViolation("unavailable");
    }
    await $global.joinRoom(seat.roomId);
    await $global.updateUserState(account, { partyMatch: null });
    return { roomId: seat.roomId };
  }

  async leaveMatch(): Promise<void> {
    await inRoom((ctx) => {
      if (ctx.match.phase === "lobby") leaveLobby(ctx.match, ctx.account);
      else ctx.events.push(...markLeft(ctx.match, ctx.secret, ctx.account, ctx.now));
    });
    await $global.leaveRoom();
  }

  async getMatchState(): Promise<MatchSnapshot> {
    return seatActions.getMatchState($sender.account);
  }

  async syncMatch(): Promise<void> {
    await seatActions.syncMatch($sender.account);
  }

  // The host's client drives the bots: it moves, shoots and uses things for them through here.
  async botCall(bot: unknown, action: unknown, args: unknown): Promise<unknown> {
    const account = requireText(bot);
    if (typeof action !== "string" || !Object.prototype.hasOwnProperty.call(seatActions, action)) {
      throw new RuleViolation("unavailable");
    }
    const match = await readMatch(currentRoom());
    if (!match || !isBot(account) || !match.players.includes(account) || matchHost(match) !== $sender.account) {
      throw new RuleViolation("not_authority");
    }
    const run = seatActions[action as keyof typeof seatActions] as (who: string, ...rest: unknown[]) => Promise<unknown>;
    return run(account, ...(Array.isArray(args) ? args : []));
  }

  async devAdvanceClock(ms: number): Promise<number> {
    requireTestAccount();
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) throw new RuleViolation("unavailable");
    return inRoom((ctx) => {
      ctx.match.devClockOffsetMs += ms;
      ctx.now += ms;
      return ctx.now;
    });
  }

  async devSetStage(stage: unknown): Promise<void> {
    requireTestAccount();
    if (typeof stage !== "string" || !(STAGES as readonly string[]).includes(stage)) {
      throw new RuleViolation("unavailable");
    }
    await inRoom((ctx) => {
      requireLive(ctx);
      skipToStage(ctx.match, LEVEL, stage as Stage, ctx.now);
    });
  }

  async reportPose(pose: unknown): Promise<void> {
    await seatActions.reportPose($sender.account, pose);
  }

  async reportMonsters(updates: unknown): Promise<void> {
    if (!Array.isArray(updates) || updates.length > 32) throw new RuleViolation("unavailable");
    const valid = updates.filter((u): u is MonsterPoseUpdate => isPose(u) && typeof (u as { id?: unknown }).id === "string");
    await inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...applyMonsterPoses(ctx.match, secret, ctx.account, valid, ctx.now));
    });
  }

  async possess(monsterId: unknown): Promise<PrivateView> {
    const id = requireText(monsterId);
    return inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const body = await readPose(ctx.roomId, ctx.account);
      ctx.events.push(...startPossession(ctx.match, secret, ctx.account, id, body, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async release(): Promise<PrivateView> {
    return inRoom((ctx) => {
      const secret = requireLive(ctx);
      ctx.events.push(...releasePossession(ctx.match, secret, ctx.account, ctx.now));
      return privateView(ctx.match, secret, ctx.account);
    });
  }

  async strikeMonster(monsterId: unknown): Promise<void> {
    await seatActions.strikeMonster($sender.account, monsterId);
  }

  async attackWithMonster(monsterId: unknown, target: unknown): Promise<void> {
    const id = requireText(monsterId);
    const who = requireText(target);
    await inRoom(async (ctx) => {
      const secret = requireLive(ctx);
      const to = await readPose(ctx.roomId, who);
      ctx.events.push(...monsterAttack(ctx.match, secret, ctx.account, id, who, to, ctx.now));
    });
  }

  async useSkill(): Promise<void> {
    await seatActions.useSkill($sender.account);
  }

  async interact(): Promise<void> {
    await seatActions.interact($sender.account);
  }

  async escape(): Promise<void> {
    await seatActions.escape($sender.account);
  }

  // Platform hook (every 200-1000 ms per active room). Drives the clock-based rules:
  // the lobby's bot fill, plate votes, the seal channel and the deadline. Saves only when something changed.
  async $roomTick(_deltaMillis: number, roomId: string): Promise<void> {
    const peek = await readMatch(roomId);
    if (peek?.phase === "lobby") {
      await withRoomLock(roomId, async () => {
        const match = await readMatch(roomId);
        if (match && (await startWithBots(match, clock(match)))) await writeMatch(roomId, match);
      });
      return;
    }
    if (!peek || peek.phase !== "playing") return;
    await withRoomLock(roomId, async () => {
      const match = await readMatch(roomId);
      const secret = match ? await readSecret(match) : null;
      if (!match || !secret || match.phase !== "playing") return;
      const before = JSON.stringify([match, secret]);
      const now = clock(match);
      const ctx: RoomContext = { roomId, account: "", match, secret, now, events: [] };
      const poses = await readPoses(roomId, match.players);
      ctx.events.push(...stepVote(match, secret, poses, LEVEL, now));
      advanceObjectives(match, poses, LEVEL, now);
      ctx.events.push(...resolveOutcome(match, secret, now));
      // No $room outside a request: clients see the changes through the room state.
      if (JSON.stringify([match, secret]) !== before) await commit(ctx);
    });
  }
}
