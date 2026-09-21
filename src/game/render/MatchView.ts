import * as THREE from "three";
import type { ClientPhase, ClientState, MatchClient } from "../../net/matchClient";
import { ModelLibrary } from "../assets/ModelLibrary";
import {
  DEVICE_COUNT, EXIT_RADIUS, MONSTER_STATS, POSSESS_RANGE, RANGE_SLACK,
  SEAL_DURATION_MS, SEAL_RADIUS, SHARD_COUNT, VOTE_DECIDE_HOLD_MS,
} from "../match/constants";
import { botFillInMs, isActive, isBound } from "../match/lifecycle";
import { weaponOf } from "../match/damage";
import { inStrikeReach } from "../match/melee";
import { bearingTo, guideFor } from "../match/guide";
import { BOSS_ID, interactableNear, type Interactable } from "../match/objectives";
import type { MatchResult, PlayerResult, Pose, Possession, PublicMatch, Stage } from "../match/types";
import { distance } from "../match/view";
import { tallyPlates, votesNeeded } from "../match/vote";
import { RUINS, TILE_SIZE, parseLevel, solidWith, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { groundAt, platformBlocks } from "../rules/platforms";
import {
  GROUNDED, PLAYER_RADIUS, WALK_SPEED, applyLook, stepJump, stepPlayer, type Airborne, type SolidTest,
} from "../rules/movement";
import { FpsInput } from "./FpsInput";
import { LightPool } from "./lightPool";
import { MonsterActor } from "./MonsterActor";
import { OBJECTIVE_MODELS, ObjectiveProps } from "./ObjectiveProps";
import { PlayerActor, type PlayerStatus } from "./PlayerActor";
import { MONSTER_MODELS, skinFor } from "./monsterLooks";
import { LEVEL_MODELS, buildLevelScene } from "./levelScene";
import { CHASE, chaseCamera } from "../rules/chaseCamera";
import { COSTUME_MODELS, wearing } from "./costumes";
import { displayName, ownName } from "./names";
import { playScream, playThud } from "./scream";
import { settings } from "../../ui/settings";

export const LOOK_SENSITIVITY = 0.0022;

export const MATCH_MODELS = [...new Set([...LEVEL_MODELS, ...OBJECTIVE_MODELS, ...COSTUME_MODELS, ...MONSTER_MODELS])];

const MONSTER_EYE = 1.5;
// Outdoors nothing roofs the camera in; this only keeps it from flying off.
const SKY_CEILING = 30;
// Share of walking speed kept while the shield is up.
const BLOCK_WALK = 0.55;
const POSSESSED_SPEED_FACTOR = 1.3;
const HUD_INTERVAL_MS = 100;
const SHAKE_MS = 350;
// Real-time point lights shared by all lamps; everything farther only has baked light.
export const LIGHT_SLOTS = 6;
const SHAKE_SIZE = 0.06;
const INTERACT_LABEL: Record<Interactable["kind"], string> = {
  shard: "E: 광석 캐기",
  gate: "E: 광석으로 나무 문 열기",
  device: "E: 룬 선돌 깨우기",
  altar: "E: 봉인 해제 시작",
};

export interface ObjectiveHud {
  stage: Stage;
  shards: number;
  shardTotal: number;
  devicesOn: number;
  deviceTotal: number;
  sealStarted: boolean;
  sealMs: number;
  sealTotalMs: number;
  guarded: boolean;
  bossHp: number | null;
  bossMaxHp: number;
}

export interface VoteHud {
  remainingMs: number;
  needed: number;
  plates: { name: string; votes: number; skip: boolean }[];
  // The plate I stand on, and the one a majority holds.
  mine: number | null;
  leading: number | null;
  decideInMs: number | null;
}

export interface HudState {
  phase: ClientPhase;
  role: "adventurer" | "traitor" | null;
  hp: number | null;
  elapsedMs: number | null;
  alive: boolean;
  escaped: boolean;
  possession: { monsterId: string; remainingMs: number } | null;
  possessReadyInMs: number | null;
  canPossess: boolean;
  nearExit: boolean;
  players: number;
  // Until the lobby's empty seats go to bots; null outside a waiting lobby.
  botFillInMs: number | null;
  name: string;
  painAt: number | null;
  error: { code: string; at: number } | null;
  result: MatchResult | null;
  results: PlayerResult[] | null;
  objective: ObjectiveHud | null;
  interactHint: string | null;
  vote: VoteHud | null;
  // name is null when the round was skipped or undecided.
  lastVote: { name: string | null; guilty: boolean; ageMs: number } | null;
  boundMs: number | null;
  revealed: string | null;
  sealed: boolean;
  // Practice only: the step to take now, where it is and how far.
  guide: GuideHud | null;
  // The shield is up.
  blocking: boolean;
}

export interface GuideHud {
  text: string;
  // Where the step is, as an angle from the middle of the screen; null when there is nowhere to go.
  bearing: number | null;
  distance: number | null;
}

export interface MatchViewOptions {
  onProgress?: (done: number, total: number) => void;
  onFrame?: (dt: number, ownPose: Pose | null) => void;
  // Practice mode walks a new player through the objectives step by step.
  tutorial?: boolean;
}

export interface MatchDebugHandle {
  pose(): { x: number; z: number; yaw: number; pitch: number };
  setPose(p: { x: number; z: number; yaw: number; pitch?: number }): void;
  stats(): { triangles: number; calls: number };
  hud(): HudState | null;
  state(): ClientState;
  layout(): LevelLayout;
  scene(): THREE.Scene;
  fire(): Promise<string | null>;
  possessNearest(): Promise<string | null>;
  release(): Promise<string | null>;
  interact(): Promise<string | null>;
  escape(): Promise<string | null>;
  advanceClock(ms: number): Promise<string | null>;
  setStage(stage: Stage): Promise<string | null>;
}

export class MatchView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 80);
  private readonly clock = new THREE.Clock();
  private readonly layout: LevelLayout = parseLevel(RUINS, TILE_SIZE);
  private readonly input: FpsInput;
  private readonly resizeObserver: ResizeObserver;
  private resizeFrame = 0;
  private readonly lights = new LightPool(this.scene, LIGHT_SLOTS);
  private readonly monsters = new Map<string, MonsterActor>();
  private readonly players = new Map<string, PlayerActor>();
  private readonly hudListeners = new Set<(hud: HudState) => void>();
  // Walls and closed gates only: shots fly over the crates.
  private solid: SolidTest = solidWith(this.layout, [], Infinity);
  private gatesKey = "";
  // What stops you: a platform too tall to be standing on at your feet height stops you too.
  private readonly isSolid = (x: number, z: number) =>
    this.solid(x, z) || platformBlocks(this.layout.platforms, x, z, this.air.y);
  // Monsters never leave the floor, so every platform is a wall to them.
  private readonly isSolidOnFloor = (x: number, z: number) =>
    this.solid(x, z) || platformBlocks(this.layout.platforms, x, z, 0);
  private library: ModelLibrary | null = null;
  private props: ObjectiveProps | null = null;
  private pose: Pose;
  private swings = 0;
  private air: Airborne = GROUNDED;
  private yaw = 0;
  private pitch = 0;
  private spawned = false;
  private lastShotAt = Number.NEGATIVE_INFINITY;
  private pendingAction = false;
  private painAt: number | null = null;
  private error: { code: string; at: number } | null = null;
  private lastHud: HudState | null = null;
  private lastHudAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private disposed = false;
  private offPain: (() => void) | null = null;
  private shakeUntil = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly client: MatchClient,
    private readonly options: MatchViewOptions = {},
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.input = new FpsInput(this.renderer.domElement);
    this.pose = { ...this.layout.playerSpawn, yaw: 0 };
    this.scene.add(this.camera);
    // Resize on the next frame, not inside the observer callback, so the browser never reports a ResizeObserver loop.
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.resize());
    });
    this.resizeObserver.observe(container);
    this.resize();
  }

  async start(): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(MATCH_MODELS, this.options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.library = library;
    buildLevelScene(this.scene, library, this.layout, this.lights);
    this.addCameraLamp();
    this.props = new ObjectiveProps(this.scene, this.layout, library, this.lights);
    this.props.onLand = () => {
      this.shakeUntil = performance.now() + SHAKE_MS;
      playThud();
    };
    this.offPain = this.client.onPain(() => {
      this.painAt = performance.now();
      playScream();
    });
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  onHud(cb: (hud: HudState) => void): () => void {
    this.hudListeners.add(cb);
    return () => {
      this.hudListeners.delete(cb);
    };
  }

  debugHandle(): MatchDebugHandle {
    return {
      pose: () => ({ ...this.pose, pitch: this.pitch }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw };
        this.yaw = p.yaw;
        this.pitch = p.pitch ?? 0;
        this.spawned = true;
      },
      stats: () => ({ triangles: this.renderer.info.render.triangles, calls: this.renderer.info.render.calls }),
      hud: () => this.lastHud,
      state: () => this.client.state,
      layout: () => this.layout,
      scene: () => this.scene,
      fire: () => {
        const match = this.client.state.match;
        if (!match) return Promise.resolve("not_playing");
        this.placeCamera(match, this.client.state.you.possession);
        return this.strike(match);
      },
      possessNearest: () => {
        const match = this.client.state.match;
        const id = match ? this.possessCandidate(match) : null;
        return id ? this.client.possess(id) : Promise.resolve("no_monster");
      },
      release: () => this.client.release(),
      interact: () => this.client.interact(),
      escape: () => this.client.escape(),
      advanceClock: (ms) => this.client.advanceClock(ms),
      setStage: (stage) => this.client.setStage(stage),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.offPain?.();
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudListeners.clear();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const state = this.client.state;
    const match = state.match;
    const me = this.client.account;
    const now = this.client.serverNow();

    if (match && !this.spawned && match.players.includes(me)) {
      const spot = spawnPoint(this.layout, match.players.indexOf(me));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
      this.spawned = true;
    }
    if (match) this.refreshSolid(match);

    const look = this.input.consumeLook();
    const view = applyLook(this.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY * settings().sensitivity);
    this.renderer.toneMappingExposure = settings().brightness;
    this.yaw = view.yaw;
    this.pitch = view.pitch;

    const possession = state.you.possession;
    const active = !!match && match.phase === "playing" && isActive(match, me);
    const bound = !!match && isBound(match, me, now);
    const move = this.input.moveInput();
    if (active && possession && match) {
      this.driveMonster(match, possession.monsterId, move, dt);
    } else if (active && !bound) {
      // Walking behind a raised shield is slower.
      const speed = WALK_SPEED * (this.input.blocking ? BLOCK_WALK : 1);
      this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, move, dt, this.isSolid, speed);
    } else if (active) {
      this.pose = { ...this.pose, yaw: this.yaw };
    }
    // Space jumps, onto the crates and blocks under you; a bound or possessing player stays put.
    const jump = this.input.consumePress("Space");
    const ground = groundAt(this.layout.platforms, this.pose.x, this.pose.z, PLAYER_RADIUS);
    this.air = active && !possession && !bound ? stepJump(this.air, jump, dt, ground) : GROUNDED;
    this.pose = { ...this.pose, y: this.air.y, block: active && !possession && !bound && this.input.blocking, swing: this.swings };
    if (match) this.handleActions(match, state, possession, active, bound);
    if (active && !possession) this.client.reportPose(this.pose);
    this.options.onFrame?.(dt, active ? this.pose : null);
    this.client.tick();

    if (match) {
      this.syncActors(match, state, dt, possession, now);
      this.props?.update(match, now, dt, match.players.map((p) => displayName(p, me)));
      this.placeCamera(match, possession);
    }

    this.lights.update(this.camera.position);

    this.emitHud(match, state, possession, active, bound);
    this.renderer.render(this.scene, this.camera);
  };

  private refreshSolid(match: PublicMatch): void {
    const key = match.objectives.gates.join(",");
    if (key === this.gatesKey) return;
    this.gatesKey = key;
    this.solid = solidWith(this.layout, match.objectives.gates, Infinity);
  }

  private handleActions(
    match: PublicMatch, state: ClientState, possession: Possession | null, active: boolean, bound: boolean,
  ): void {
    const pressInteract = this.input.consumePress("KeyE");
    const pressPossess = this.input.consumePress("KeyQ");
    const pressEscape = this.input.consumePress("KeyF");
    const pressRelease = this.input.consumePress("KeyR");
    if (!active) return;

    if (possession) {
      if (this.pendingAction) return;
      if (pressRelease) {
        this.perform(() => this.client.release());
        return;
      }
      if (this.input.firing) {
        const victim = this.attackCandidate(match, possession.monsterId);
        if (victim) this.perform(() => this.client.attackWithMonster(possession.monsterId, victim));
      }
      return;
    }

    // Only the body is tied up: a bound traitor can still possess.
    if (!this.pendingAction && pressPossess && state.you.role === "traitor") {
      const id = this.possessCandidate(match);
      if (id) this.perform(() => this.client.possess(id));
      else this.fail("no_monster");
    }
    if (bound) {
      if (pressInteract || pressEscape || this.input.firing) this.fail("bound");
      return;
    }
    if (!this.pendingAction && pressInteract) this.perform(() => this.client.interact());
    if (!this.pendingAction && pressEscape) this.perform(() => this.client.escape());
    // Holding the shield up keeps the sword down.
    const weapon = weaponOf(match, this.client.account);
    if (this.input.firing && !this.input.blocking && this.client.serverNow() - this.lastShotAt >= weapon.intervalMs) {
      void this.strike(match);
    }
  }

  // Swings at the nearest monster in front of you, within the sword's reach. Swords only hurt
  // monsters: nobody can hit another player, the traitor included.
  private strike(match: PublicMatch): Promise<string | null> {
    this.lastShotAt = this.client.serverNow();
    // Every swing shows, hit or miss: the count rides along with the pose.
    this.swings += 1;
    const weapon = weaponOf(match, this.client.account);
    const me = { ...this.pose, yaw: this.yaw };
    let best: { id: string; d: number } | null = null;
    for (const [id, m] of Object.entries(match.monsters)) {
      if (!m.alive || !inStrikeReach(me, m, weapon)) continue;
      const d = distance(me, m);
      if (!best || d < best.d) best = { id, d };
    }
    if (!best) return Promise.resolve("miss");
    return this.client.strikeMonster(best.id).then((code) => {
      if (code) this.fail(code);
      return code;
    });
  }

  private driveMonster(
    match: PublicMatch, monsterId: string, move: { forward: number; strafe: number }, dt: number,
  ): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const speed = MONSTER_STATS[monster.kind].speed * POSSESSED_SPEED_FACTOR;
    const next = stepPlayer({ x: monster.x, z: monster.z, yaw: this.yaw }, move, dt, this.isSolidOnFloor, speed);
    if (next.x === monster.x && next.z === monster.z && Math.abs(this.yaw - monster.yaw) < 1e-3) return;
    this.client.reportMonsters([{ id: monsterId, x: next.x, z: next.z, yaw: this.yaw }]);
  }

  private possessCandidate(match: PublicMatch): string | null {
    let best: { id: string; d: number } | null = null;
    for (const [id, m] of Object.entries(match.monsters)) {
      if (!m.alive || m.possessed || m.kind === "boss") continue;
      const d = distance(this.pose, m);
      if (d <= POSSESS_RANGE && (!best || d < best.d)) best = { id, d };
    }
    return best?.id ?? null;
  }

  private attackCandidate(match: PublicMatch, monsterId: string): string | null {
    const monster = match.monsters[monsterId];
    if (!monster) return null;
    const me = this.client.account;
    const reach = MONSTER_STATS[monster.kind].range + RANGE_SLACK;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const p = this.client.state.poses[account];
      if (account === me || !p || !isActive(match, account)) continue;
      const d = distance(p, monster);
      if (d <= reach && (!best || d < best.d)) best = { account, d };
    }
    if (!best) return null;
    return monster.attackReadyAt <= this.client.serverNow() ? best.account : null;
  }

  private perform(action: () => Promise<string | null>): void {
    this.pendingAction = true;
    void action()
      .then((code) => {
        if (code) this.fail(code);
      })
      .finally(() => {
        this.pendingAction = false;
      });
  }

  private fail(code: string): void {
    this.error = { code, at: performance.now() };
  }

  private syncActors(match: PublicMatch, state: ClientState, dt: number, possession: Possession | null, now: number): void {
    const library = this.library;
    if (!library) return;
    for (const [id, m] of Object.entries(match.monsters)) {
      let actor = this.monsters.get(id);
      if (!actor) {
        const skin = skinFor(m.kind, id);
        actor = new MonsterActor(id, library.instance(skin.model), library.get(skin.model).animations, skin.look);
        this.scene.add(actor.object);
        this.monsters.set(id, actor);
      }
      actor.sync(m, dt, possession?.monsterId === id);
    }

    const me = this.client.account;
    for (const account of match.players) {
      let actor = this.players.get(account);
      if (!actor) {
        const costume = wearing(match.looks, account, match.players.indexOf(account));
        actor = new PlayerActor(account, {
          object: library.instance(costume.model), clips: library.get(costume.model).animations, costume,
        });
        this.scene.add(actor.object);
        this.players.set(account, actor);
      }
      const status: PlayerStatus = match.dead.includes(account) ? "dead" : match.escaped.includes(account) ? "escaped" : "active";
      // The camera sits behind you, so your own body is drawn from your local pose.
      const pose = account === me ? this.pose : (state.poses[account] ?? null);
      actor.sync(pose, status, dt);
      actor.mark(match.revealed === account, isBound(match, account, now));
    }
  }

  private placeCamera(match: PublicMatch, possession: Possession | null): void {
    // Over the shoulder of whatever you drive: your body, or the monster you possess.
    const monster = possession ? match.monsters[possession.monsterId] : undefined;
    const body = monster ? { x: monster.x, z: monster.z, y: MONSTER_EYE - CHASE.height } : this.pose;
    const cam = chaseCamera(body, this.yaw, this.pitch, this.solid, SKY_CEILING);
    this.camera.position.set(cam.x, cam.y, cam.z);
    const shake = this.shakeUntil - performance.now();
    if (shake > 0) {
      const size = SHAKE_SIZE * (shake / SHAKE_MS);
      this.camera.position.x += (Math.random() - 0.5) * size;
      this.camera.position.y += (Math.random() - 0.5) * size;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  private emitHud(
    match: PublicMatch | null, state: ClientState, possession: Possession | null, active: boolean, bound: boolean,
  ): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const me = this.client.account;
    const serverNow = this.client.serverNow();
    const readyAt = state.you.possessReadyAt;
    const possessReadyInMs = readyAt === null ? null : Math.max(0, readyAt - serverNow);
    const exit = this.layout.exits[0];
    const playing = !!match && match.phase === "playing";
    const free = active && !possession && !bound;
    const usable = match && free ? interactableNear(match, this.layout, this.pose, serverNow) : null;
    const last = match?.vote.last ?? null;
    const hud: HudState = {
      phase: state.phase,
      role: state.you.role,
      hp: state.you.hp,
      elapsedMs: match && playing && match.startedAt !== null ? Math.max(0, serverNow - match.startedAt) : null,
      alive: match ? !match.dead.includes(me) : true,
      escaped: match ? match.escaped.includes(me) : false,
      possession: possession ? { monsterId: possession.monsterId, remainingMs: Math.max(0, possession.endsAt - serverNow) } : null,
      possessReadyInMs,
      canPossess: !!match && active && !possession && state.you.role === "traitor" && match.revealed !== me
        && possessReadyInMs === 0 && this.possessCandidate(match) !== null,
      nearExit: free && !!match && match.objectives.stage === "exit" && !!exit && distance(this.pose, exit) <= EXIT_RADIUS,
      players: match?.players.length ?? 0,
      botFillInMs: match ? botFillInMs(match, serverNow) : null,
      name: ownName(me),
      painAt: this.painAt,
      error: this.error,
      result: match?.result ?? null,
      results: match?.results ?? null,
      objective: match && playing ? this.objectiveHud(match, state, serverNow) : null,
      interactHint: usable ? INTERACT_LABEL[usable.kind] : null,
      vote: match && playing ? this.voteHud(match, state, serverNow) : null,
      lastVote: last
        ? { name: last.accused === null ? null : displayName(last.accused, me), guilty: last.guilty, ageMs: serverNow - last.at }
        : null,
      boundMs: match && bound ? (match.bound[me] ?? serverNow) - serverNow : null,
      revealed: match?.revealed ? displayName(match.revealed, me) : null,
      sealed: !!match && match.revealed === me,
      guide: this.options.tutorial && match && active && !possession ? this.guideHud(match) : null,
      blocking: !!this.pose.block,
    };
    this.lastHud = hud;
    for (const listener of this.hudListeners) listener(hud);
  }

  private guideHud(match: PublicMatch): GuideHud | null {
    const guide = guideFor(this.layout, match, this.pose);
    if (!guide) return null;
    if (!guide.at) return { text: guide.text, bearing: null, distance: null };
    return {
      text: guide.text,
      bearing: bearingTo({ ...this.pose, yaw: this.yaw }, guide.at),
      distance: distance(this.pose, guide.at),
    };
  }

  private posesWithMine(state: ClientState): Record<string, Pose> {
    return { ...state.poses, [this.client.account]: this.pose };
  }

  private objectiveHud(match: PublicMatch, state: ClientState, now: number): ObjectiveHud {
    const o = match.objectives;
    const altar = this.layout.altar;
    const poses = this.posesWithMine(state);
    const guarded = !!altar && match.players.some((p) => {
      const pose = poses[p];
      return !!pose && isActive(match, p) && distance(pose, altar) <= SEAL_RADIUS;
    });
    const boss = match.monsters[BOSS_ID];
    return {
      stage: o.stage,
      shards: o.shards.filter(Boolean).length,
      shardTotal: SHARD_COUNT,
      devicesOn: o.devices.filter((until) => until > now).length,
      deviceTotal: DEVICE_COUNT,
      sealStarted: o.seal.lastAt !== null,
      sealMs: o.seal.progressMs,
      sealTotalMs: SEAL_DURATION_MS,
      guarded,
      bossHp: boss ? boss.hp : null,
      bossMaxHp: MONSTER_STATS.boss.hp,
    };
  }

  private voteHud(match: PublicMatch, state: ClientState, now: number): VoteHud | null {
    const round = match.vote.round;
    if (!round) return null;
    const me = this.client.account;
    const tallies = tallyPlates(match, this.posesWithMine(state), round.plates);
    return {
      remainingMs: Math.max(0, round.endsAt - now),
      needed: votesNeeded(match),
      plates: tallies.map((t) => ({
        name: t.accused === null ? "건너뛰기" : displayName(t.accused, me),
        votes: t.votes,
        skip: t.accused === null,
      })),
      mine: tallies.find((t) => t.voters.includes(me))?.plate ?? null,
      leading: round.leading,
      decideInMs: round.leading === null ? null : Math.max(0, round.since + VOTE_DECIDE_HOLD_MS - now),
    };
  }

  private addCameraLamp(): void {
    const lamp = new THREE.SpotLight(0xfff1dc, 90, 24, 0.8, 0.7, 2);
    lamp.position.set(0, 0, 0);
    lamp.target.position.set(0, 0, -1);
    this.camera.add(lamp, lamp.target);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
