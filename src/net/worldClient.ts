import { readJumpY } from "../game/rules/movement";
import { PROTOCOL_VERSION, isPose, readSwing, type Pose } from "../game/world/types";
import { readMonsterType, type MonsterState } from "../game/world/monsters";
import type { ZoneEntry, ZoneId, ZoneLook } from "../game/world/zones";
import { errorCode } from "./errors";
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
}

export interface WorldState {
  phase: WorldPhase;
  entry: ZoneEntry | null;
  others: OtherPlayer[];
  // The monsters of your channel, by id.
  monsters: Record<string, MonsterState>;
  me: Vitals | null;
  error: string | null;
}

// What an attack or skill did, as the server answers it.
export interface HitResult { hit: string[]; killed: string[]; xp: number }

// Moving, your pose goes out this often; standing still, this often, so the others keep hearing you.
export const POSE_THROTTLE_MS = 100;
export const IDLE_POSE_MS = 1000;
// Verse8 turns away more than 10 calls a second to one function, so no two poses leave closer than
// this; a guard, attack or skill that comes sooner goes out with the next one.
export const MIN_POSE_GAP_MS = 110;
// Smaller changes than these count as standing still.
const POSE_EPSILON = 0.01;

function readLook(raw: unknown): ZoneLook | null {
  const l = raw as Partial<ZoneLook> | undefined;
  if (!l || typeof l.name !== "string" || typeof l.costume !== "string" || typeof l.playerClass !== "string") return null;
  return { name: l.name, costume: l.costume, playerClass: l.playerClass, level: typeof l.level === "number" ? l.level : 1 };
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
    };
  }
  return out;
}

function readVitals(user: Record<string, unknown>): Vitals | null {
  if (typeof user.hp !== "number" || typeof user.maxHp !== "number") return null;
  return { hp: user.hp, maxHp: user.maxHp, dead: user.dead === true, xp: num(user.xp) };
}

// Your place in the open world: which zone and channel you are in, who else is there and where,
// and your own pose going out to them.
export class WorldClient {
  private current: WorldState = { phase: "idle", entry: null, others: [], monsters: {}, me: null, error: null };
  private readonly listeners = new Set<(s: WorldState) => void>();
  private unsubscribers: (() => void)[] = [];
  private members: string[] = [];
  private users: Record<string, unknown>[] = [];
  private lastPose: (Pose & { at: number }) | null = null;

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

  // Every POSE_THROTTLE_MS while moving, every IDLE_POSE_MS while standing still; a guard, an attack
  // or a skill as soon as MIN_POSE_GAP_MS allows. Called every frame, so nothing held back is lost.
  reportPose(pose: Pose): void {
    if (this.current.phase !== "in") return;
    if (this.lastPose && this.now() - this.lastPose.at < MIN_POSE_GAP_MS) return;
    const sent = {
      x: pose.x, z: pose.z, yaw: pose.yaw, y: readJumpY(pose.y), block: pose.block === true,
      swing: readSwing(pose.swing), skill: readSwing(pose.skill),
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
    return this.transport.call<HitResult>("strike", [monsterId, yaw]).catch(() => null);
  }

  async useSkill(yaw: number): Promise<HitResult | null> {
    if (this.current.phase !== "in") return null;
    return this.transport.call<HitResult>("useSkill", [yaw]).catch(() => null);
  }

  // Fallen: back to the village.
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
  private async moveTo(entry: ZoneEntry): Promise<void> {
    await this.transport.joinRoom(entry.roomId);
    await this.transport.call("arrive");
    this.arrive(entry);
  }

  private arrive(entry: ZoneEntry): void {
    this.unlisten();
    this.members = [];
    this.users = [];
    this.lastPose = null;
    this.set({ phase: "in", entry, others: [], monsters: {}, me: null, error: null });
    this.unsubscribers = [
      this.transport.subscribeRoomState(entry.roomId, (state) => {
        const users = (state as { $users?: unknown }).$users;
        this.members = Array.isArray(users) ? users.filter((u): u is string => typeof u === "string") : [];
        const monsters = (state as { monsters?: unknown }).monsters;
        if (monsters !== undefined) this.set({ monsters: readMonsters(monsters) });
        this.refreshOthers();
      }),
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
      if (account === this.account) me = readVitals(user) ?? me;
      if (typeof account !== "string" || account === this.account || !this.members.includes(account)) continue;
      const look = readLook(user.look);
      if (!look || !isPose(user.pose)) continue;
      const p = user.pose;
      others.push({
        account, look,
        pose: { x: p.x, z: p.z, yaw: p.yaw, y: readJumpY(p.y), block: p.block === true, swing: readSwing(p.swing), skill: readSwing(p.skill) },
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
