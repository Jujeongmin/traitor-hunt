import { readSlot } from "../game/combat/skills";
import { readJumpY } from "../game/rules/movement";
import { PROTOCOL_VERSION, isPose, readSwing, type Pose } from "../game/world/types";
import type { BagView, ItemId, Slot } from "../game/account/items";
import type { JobId } from "../game/combat/jobs";
import type { RankDetail, RankingView } from "../game/account/ranking";
import { readMonsterType, type MonsterState } from "../game/world/monsters";
import type { ZoneEntry, ZoneId, ZoneLook } from "../game/world/zones";
import { errorCode } from "./errors";
import type { EnhanceOutcome } from "../game/account/forge";
import { readChat, type ChatMessage } from "../game/world/chat";
import type { MatchTransport } from "./transport";

export type WorldPhase = "idle" | "entering" | "in" | "travelling" | "error";

// Someone else in your zone and channel.
export interface OtherPlayer {
  account: string;
  pose: Pose;
  look: ZoneLook;
}

// You in a fight, as the server keeps it.
export interface Vitals {
  hp: number;
  maxHp: number;
  dead: boolean;
  xp: number;
  // XP lost to the last fall (0 when none).
  lostXp: number;
}

export interface WorldState {
  phase: WorldPhase;
  entry: ZoneEntry | null;
  others: OtherPlayer[];
  // The monsters of your channel, by id.
  monsters: Record<string, MonsterState>;
  me: Vitals | null;
  // Your gold, bag and gear; null until the server has said.
  bag: BagView | null;
  error: string | null;
  // The lines said in the channels you have been in this session, oldest first (at most CHAT_KEEP).
  chat: ChatLine[];
}

// A chat line as the client keeps it: numbered in the order it came, when it came (by this
// client's clock), and whether it is yours.
export interface ChatLine extends ChatMessage {
  id: number;
  heardAt: number;
  mine: boolean;
}

const CHAT_KEEP = 50;

function readChatMessage(raw: unknown): ChatMessage | null {
  const m = raw as Record<string, unknown> | null;
  if (!m || typeof m !== "object" || typeof m.account !== "string" || typeof m.name !== "string") return null;
  const text = readChat(m.text);
  return text === null ? null : { account: m.account, name: m.name, text, at: num(m.at) };
}

// What an attack or skill did, as the server answers it: what it hit and felled, and what that paid.
export interface HitResult { hit: string[]; killed: string[]; xp: number; gold: number; items: ItemId[] }
// What the server paid you for a kill, yours or one you helped with: the XP, gold and items (all
// zero when you only counted it toward your quest).
export interface Payout { xp: number; gold: number; items: ItemId[] }

function readPayout(raw: unknown): (Payout & { id: string }) | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || typeof p.id !== "string") return null;
  const items = Array.isArray(p.items) ? p.items.filter((i): i is ItemId => typeof i === "string") : [];
  return { id: p.id, xp: num(p.xp), gold: num(p.gold), items };
}

// Moving, your pose goes out this often; standing still, this often, so the others keep hearing you.
export const POSE_THROTTLE_MS = 100;
export const IDLE_POSE_MS = 1000;
// Verse8 turns away more than 10 calls a second to one function, so no two poses leave closer than
// this; a guard, attack or skill that comes sooner goes out with the next one.
export const MIN_POSE_GAP_MS = 110;
// Joining a room is tried this many times, waiting this much longer before each retry.
const JOIN_ATTEMPTS = 4;
const JOIN_RETRY_MS = 800;
// Smaller changes than these count as standing still.
const POSE_EPSILON = 0.01;

function readLook(raw: unknown): ZoneLook | null {
  const l = raw as Partial<ZoneLook> | undefined;
  if (!l || typeof l.name !== "string" || typeof l.costume !== "string" || typeof l.playerClass !== "string") return null;
  return {
    name: l.name, costume: l.costume, playerClass: l.playerClass, level: typeof l.level === "number" ? l.level : 1,
    job: typeof l.job === "string" ? l.job : null,
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

function readMonsters(raw: unknown): Record<string, MonsterState> {
  const out: Record<string, MonsterState> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const m = value as Record<string, unknown> | null;
    const type = readMonsterType(m?.type);
    if (!m || !type) continue;
    out[id] = {
      type, x: num(m.x), z: num(m.z), yaw: num(m.yaw), hp: num(m.hp), alive: m.alive === true,
      stunnedUntil: num(m.stunnedUntil), attackReadyAt: num(m.attackReadyAt), respawnAt: num(m.respawnAt),
      homeX: num(m.homeX), homeZ: num(m.homeZ),
      slamming: m.slamming === true, summoned: m.summoned === true,
    };
  }
  return out;
}

function readVitals(user: Record<string, unknown>): Vitals | null {
  if (typeof user.hp !== "number" || typeof user.maxHp !== "number") return null;
  return { hp: user.hp, maxHp: user.maxHp, dead: user.dead === true, xp: num(user.xp), lostXp: num(user.lostXp) };
}

// Your place in the open world: which zone and channel you are in, who else is there and where,
// and your own pose going out to them.
export class WorldClient {
  private current: WorldState = { phase: "idle", entry: null, others: [], monsters: {}, me: null, bag: null, error: null, chat: [] };
  private readonly listeners = new Set<(s: WorldState) => void>();
  private unsubscribers: (() => void)[] = [];
  private members: string[] = [];
  private users: Record<string, unknown>[] = [];
  private lastPose: (Pose & { at: number }) | null = null;
  // The last payout seen in your room user state (undefined until the room first shows you), and
  // the ones not yet taken by the view.
  private payoutSeen: string | null | undefined = undefined;
  private payouts: Payout[] = [];
  private chatCount = 0;

  constructor(
    private readonly transport: MatchTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get account(): string {
    return this.transport.account;
  }

  get state(): WorldState {
    return this.current;
  }

  onChange(cb: (s: WorldState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // Into the world where you left it.
  async enter(): Promise<void> {
    this.set({ phase: "entering", error: null });
    try {
      const version = await this.transport.call<{ protocol: number }>("getServerVersion");
      if (version?.protocol !== PROTOCOL_VERSION) {
        throw new Error(`server protocol ${version?.protocol}, client protocol ${PROTOCOL_VERSION}`);
      }
      await this.moveTo(await this.transport.call<ZoneEntry>("enterWorld"));
    } catch (error) {
      this.fail(error);
    }
  }

  // Through a portal to the zone next door. A refusal (a locked zone) leaves you where you were.
  async travel(to: ZoneId): Promise<string | null> {
    if (this.current.phase !== "in") return "unavailable";
    this.set({ phase: "travelling" });
    try {
      await this.moveTo(await this.transport.call<ZoneEntry>("travel", [to]));
      return null;
    } catch (error) {
      this.set({ phase: "in" });
      return errorCode(error);
    }
  }

  async leave(): Promise<void> {
    this.unlisten();
    this.set({ phase: "idle", entry: null, others: [], monsters: {}, me: null });
    // Keeps your spot from inside the room, then leaves it.
    await this.transport.call("leaveWorld").catch(() => undefined);
    this.transport.leaveRoom();
  }

  // Says a line in your channel. Answers null once it went out, or why it was refused.
  async say(text: string): Promise<string | null> {
    if (this.current.phase !== "in") return "unavailable";
    const line = readChat(text);
    if (line === null) return "unavailable";
    try {
      await this.transport.call("say", [line]);
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  private heard(raw: unknown): void {
    const message = readChatMessage(raw);
    if (!message) return;
    this.chatCount += 1;
    const line: ChatLine = { ...message, id: this.chatCount, heardAt: this.now(), mine: message.account === this.account };
    this.set({ chat: [...this.current.chat, line].slice(-CHAT_KEEP) });
  }

  // Every POSE_THROTTLE_MS while moving, every IDLE_POSE_MS while standing still; a guard, an attack
  // or a skill as soon as MIN_POSE_GAP_MS allows. Called every frame, so nothing held back is lost.
  reportPose(pose: Pose): void {
    if (this.current.phase !== "in") return;
    if (this.lastPose && this.now() - this.lastPose.at < MIN_POSE_GAP_MS) return;
    const sent = {
      x: pose.x, z: pose.z, yaw: pose.yaw, y: readJumpY(pose.y), block: pose.block === true,
      swing: readSwing(pose.swing), skill: readSwing(pose.skill), slot: readSlot(pose.slot) ?? 0,
    };
    const now = this.now();
    const last = this.lastPose;
    const moved = !last || Math.abs(sent.x - last.x) > POSE_EPSILON || Math.abs(sent.z - last.z) > POSE_EPSILON
      || Math.abs(sent.yaw - last.yaw) > POSE_EPSILON || Math.abs(sent.y - (last.y ?? 0)) > POSE_EPSILON;
    const acted = !!last && (sent.block !== (last.block === true) || sent.swing !== (last.swing ?? 0) || sent.skill !== (last.skill ?? 0));
    if (last && !acted && now - last.at < (moved ? POSE_THROTTLE_MS : IDLE_POSE_MS)) return;
    this.lastPose = { ...sent, at: now };
    void this.transport.call("reportPose", [sent], { needResponse: false });
  }

  // An attack on one monster; the server says whether it landed. Null when refused or not in the world.
  // Facing yaw: turning is instant, so it goes with the attack rather than waiting for the next pose.
  async strike(monsterId: string, yaw: number): Promise<HitResult | null> {
    if (this.current.phase !== "in") return null;
    return await this.transport.call<HitResult>("strike", [monsterId, yaw]).catch(() => null);
  }

  async useSkill(slot: number, yaw: number): Promise<HitResult | null> {
    if (this.current.phase !== "in") return null;
    return await this.transport.call<HitResult>("useSkill", [slot, yaw]).catch(() => null);
  }

  // 전직, and claiming a finished quest.
  advance(job: JobId): Promise<string | null> {
    return this.bagCall("advance", [job]);
  }

  claimQuest(): Promise<string | null> {
    return this.bagCall("claimQuest", []);
  }

  claimDaily(id: string): Promise<string | null> {
    return this.bagCall("claimDaily", [id]);
  }

  // Payouts that came in since the last call, oldest first.
  takePayouts(): Payout[] {
    const out = this.payouts;
    this.payouts = [];
    return out;
  }

  private notePayout(raw: unknown): void {
    const payout = readPayout(raw);
    const id = payout?.id ?? null;
    if (id === this.payoutSeen) return;
    const first = this.payoutSeen === undefined;
    this.payoutSeen = id;
    if (first || !payout) return;
    this.payouts.push({ xp: payout.xp, gold: payout.gold, items: payout.items });
    // Gold, drops and quest kills all live with the bag.
    void this.refreshBag();
  }

  async refreshBag(): Promise<void> {
    const bag = await this.transport.call<BagView>("getBag").catch(() => null);
    if (bag) this.set({ bag });
  }

  // The bag and the shop. Each answers null when done, or why it was refused.
  equip(id: ItemId): Promise<string | null> {
    return this.bagCall("equipItem", [id]);
  }

  unequip(slot: Slot): Promise<string | null> {
    return this.bagCall("unequipItem", [slot]);
  }

  drink(id: ItemId): Promise<string | null> {
    return this.bagCall("drinkPotion", [id]);
  }

  buy(id: ItemId, count = 1): Promise<string | null> {
    return this.bagCall("buyItem", [id, count]);
  }

  sell(id: ItemId, count = 1): Promise<string | null> {
    return this.bagCall("sellItem", [id, count]);
  }

  private async bagCall(name: string, args: unknown[]): Promise<string | null> {
    if (this.current.phase !== "in") return "unavailable";
    try {
      this.set({ bag: await this.transport.call<BagView>(name, args) });
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  // The smith: enhancing what is worn in a slot (the outcome, or why it was refused) and making things.
  async enhance(slot: Slot): Promise<{ outcome: EnhanceOutcome } | { problem: string }> {
    if (this.current.phase !== "in") return { problem: "unavailable" };
    try {
      const { outcome, bag } = await this.transport.call<{ outcome: EnhanceOutcome; bag: BagView }>("enhanceGear", [slot]);
      this.set({ bag });
      return { outcome };
    } catch (error) {
      return { problem: errorCode(error) };
    }
  }

  craft(recipe: string): Promise<string | null> {
    return this.bagCall("craftItem", [recipe]);
  }

  // The board, for the ranking panel in the world.
  ranking(): Promise<RankingView> {
    return this.transport.call<RankingView>("getRanking");
  }

  rankDetail(id: string): Promise<RankDetail> {
    return this.transport.call<RankDetail>("getRankDetail", [id]);
  }

  // Fallen: back to the village.
  // Fallen: up again where you fell, for gold. Null once up, or why it was refused.
  async reviveHere(): Promise<string | null> {
    if (this.current.phase !== "in" || !this.current.me?.dead) return "unavailable";
    try {
      await this.transport.call("reviveHere");
      void this.refreshBag();
      return null;
    } catch (error) {
      return errorCode(error);
    }
  }

  async respawn(): Promise<void> {
    if (this.current.phase !== "in" || !this.current.me?.dead) return;
    this.set({ phase: "travelling" });
    try {
      await this.moveTo(await this.transport.call<ZoneEntry>("respawn"));
    } catch (error) {
      this.set({ phase: "in" });
      this.set({ error: errorCode(error) });
    }
  }

  dispose(): void {
    this.unlisten();
    this.listeners.clear();
  }

  // Joins the room the server picked and stands your character in it (Verse8 2.0: the client joins).
  // Joining a room can fail for a moment (the room server busy, a network blip); the platform marks
  // such failures as not terminal, and they are tried again a few times before giving up.
  private async moveTo(entry: ZoneEntry): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.transport.joinRoom(entry.roomId);
        break;
      } catch (error) {
        const terminal = (error as { terminal?: unknown } | null)?.terminal === true;
        if (terminal || attempt >= JOIN_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, JOIN_RETRY_MS * attempt));
      }
    }
    await this.transport.call("arrive");
    this.arrive(entry);
  }

  private arrive(entry: ZoneEntry): void {
    this.unlisten();
    this.members = [];
    this.users = [];
    this.lastPose = null;
    this.payoutSeen = undefined;
    this.set({ phase: "in", entry, others: [], monsters: {}, me: null, error: null });
    void this.refreshBag();
    this.unsubscribers = [
      this.transport.subscribeRoomState(entry.roomId, (state) => {
        const users = (state as { $users?: unknown }).$users;
        this.members = Array.isArray(users) ? users.filter((u): u is string => typeof u === "string") : [];
        const monsters = (state as { monsters?: unknown }).monsters;
        if (monsters !== undefined) this.set({ monsters: readMonsters(monsters) });
        this.refreshOthers();
      }),
      this.transport.onRoomMessage(entry.roomId, "chat", (message) => this.heard(message)),
      this.transport.subscribeRoomUsers(entry.roomId, (users) => {
        this.users = users as unknown as Record<string, unknown>[];
        this.refreshOthers();
      }),
    ];
  }

  // The others: whoever the room lists as present, with a pose and a look.
  private refreshOthers(): void {
    const others: OtherPlayer[] = [];
    let me: Vitals | null = this.current.me;
    for (const user of this.users) {
      const account = user.account;
      if (account === this.account) {
        me = readVitals(user) ?? me;
        this.notePayout(user.payout);
      }
      if (typeof account !== "string" || account === this.account || !this.members.includes(account)) continue;
      const look = readLook(user.look);
      if (!look || !isPose(user.pose)) continue;
      const p = user.pose;
      others.push({
        account, look,
        pose: {
          x: p.x, z: p.z, yaw: p.yaw, y: readJumpY(p.y), block: p.block === true, swing: readSwing(p.swing), skill: readSwing(p.skill),
          slot: readSlot(p.slot) ?? 0,
        },
      });
    }
    this.set({ others, me });
  }

  private unlisten(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
  }

  private fail(error: unknown): void {
    this.set({ phase: "error", error: errorCode(error) });
  }

  private set(patch: Partial<WorldState>): void {
    this.current = { ...this.current, ...patch };
    for (const cb of this.listeners) cb(this.current);
  }
}
