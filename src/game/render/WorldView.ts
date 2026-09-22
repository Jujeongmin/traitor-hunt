import * as THREE from "three";
import type { HitResult, OtherPlayer, WorldClient } from "../../net/worldClient";
import { ITEMS } from "../account/items";
import { levelOf } from "../account/level";
import { ModelLibrary } from "../assets/ModelLibrary";
import { WEAPONS, type PlayerClass } from "../combat/classes";
import { facing, inStrikeReach } from "../combat/melee";
import { SKILLS, SKILL_KEYS, skillTargets, type Skill } from "../combat/skills";
import { PLAYER_BODY, crowdBlocks, type Body } from "../rules/crowd";
import { solidWith, type LevelLayout } from "../rules/levelLayout";
import {
  GROUNDED, PLAYER_RADIUS, WALK_SPEED, applyLook, stepAround, stepJump, stepPlayer, type Airborne, type SolidTest,
} from "../rules/movement";
import { gridRoute, lineClear } from "../rules/pathing";
import { groundAt, platformBlocks } from "../rules/platforms";
import { chaseCamera } from "../rules/chaseCamera";
import { BOSS_MOVES, MONSTERS, ZONE_BOSS, ZONE_MONSTERS, type MonsterState, type MonsterType } from "../world/monsters";
import type { Point2 } from "../rules/levelLayout";
import { NPCS, NPC_MODELS, npcNear, npcSpot, type NpcId } from "../world/npcs";
import { NpcActor } from "./NpcActor";
import type { Pose } from "../world/types";
import { PORTAL_RADIUS, START_ZONE, ZONES, ZONE_IDS, portalsOf, zoneLayout, type Portal, type ZoneEntry, type ZoneId } from "../world/zones";
import { playShot, playSkill, playSwing } from "../audio/sfx";
import { costumeById, type Costume } from "./costumes";
import { Effects } from "./effects";
import { FpsInput } from "./FpsInput";
import { HEROES, HERO_MODELS } from "./heroes";
import { createLabel, setLabel } from "./labels";
import { LEVEL_MODELS, VIEW_FAR, buildLevelScene } from "./levelScene";
import { MonsterActor } from "./MonsterActor";
import { MONSTER_SKINS } from "./monsterLooks";
import { PlayerActor } from "./PlayerActor";
import { hotbarFor, settings } from "../../ui/settings";

export const LOOK_SENSITIVITY = 0.0022;
export const WORLD_MODELS = [...new Set([...LEVEL_MODELS, ...HERO_MODELS])];

// Outdoors nothing roofs the camera in; this only keeps it from flying off.
const SKY_CEILING = 30;
// Share of walking speed kept while the guard is up.
const GUARD_WALK = 0.55;
const HUD_INTERVAL_MS = 100;
// A portal only takes you once you have stepped this far clear of it (you arrive right beside one).
const PORTAL_REARM = PORTAL_RADIUS + 0.8;
// Auto-battle looks for monsters this close, and lets one go once it is this far.
const AUTO_SEEK = 60;
const AUTO_DROP = 70;
// Auto-battle walks in until this share of your reach.
const AUTO_CLOSE = 0.8;
// How quickly the camera turns to follow an auto-battle.
const AUTO_CAMERA_RATE = 2.5;
// Heading for a quest's monsters, the route is worked out again this often.
const ROUTE_MS = 1500;
// Auto-battle that has moved less than STUCK_DISTANCE for this long takes a new route; for longer,
// it gives up on that monster for UNREACHABLE_MS.
const STUCK_DISTANCE = 0.6;
const STUCK_REROUTE_MS = 1200;
const STUCK_GIVE_UP_MS = 4000;
const UNREACHABLE_MS = 10_000;
// A walk to an NPC ends this close to them.
const TALK_ARRIVE = 2.2;
// A route's corner counts as reached this close.
const WAYPOINT_REACH = 1.2;
// A heal is used on its own once health falls below this share.
const AUTO_HEAL_BELOW = 0.75;
// A click with no monster in your arc still turns you to one this far round from where you look.
const AIM_ASSIST = Math.PI * 0.6;
// No two skills go off closer together than this.
const SKILL_GAP_MS = 900;
// A monster's loss of health this soon after your skill hit it shows as a skill's big number.
const SKILL_NUMBER_MS = 1500;
// How long the red edge flash lasts after a blow.
const HURT_FLASH_MS = 350;
// How long a "+XP" note, and a note of gold or a drop, stays up.
const GAIN_MS = 1500;
const NOTE_MS = 3000;
// Auto-battle drinks a potion below this share of health; potions go down no faster than this.
const AUTO_POTION_BELOW = 0.35;
const POTION_GAP_MS = 1000;

// The monster models a zone needs.
function zoneMonsterModels(zone: ZoneId): string[] {
  const types: MonsterType[] = [...ZONE_MONSTERS[zone]];
  const boss = ZONE_BOSS[zone];
  // A boss brings its brood.
  if (boss) types.push(boss, BOSS_MOVES.summonType);
  return [...new Set(types.map((t) => MONSTER_SKINS[t].model))];
}

export interface WorldHud {
  zone: string;
  channel: number;
  // A locked portal needs the full game or, failing that, a level.
  portal: { to: string; locked: boolean; needLevel: number | null } | null;
  // The three slots of the bar (keys 1 to 3): the skill each holds, or null while empty.
  skills: ({ skill: number; name: string; readyInMs: number; cooldownMs: number; level: number; open: boolean } | null)[];
  blocking: boolean;
  hp: number;
  maxHp: number;
  dead: boolean;
  level: number;
  xpInto: number;
  xpNeed: number;
  // XP just earned, shown for a moment.
  gain: number | null;
  auto: boolean;
  // Auto-battle is hunting for a quest's monsters.
  seeking: boolean;
  // The village NPC you are standing by, to talk to.
  npc: { id: NpcId; name: string; role: string } | null;
  // The monster you are fighting.
  target: { name: string; hp: number; maxHp: number } | null;
  // How strongly the screen's edge flashes red (0 to 1), just after a blow.
  hurt: number;
  // Potions in the bag (Q drinks one), and what the last kills paid.
  potions: number;
  notes: string[];
}

export interface WorldViewOptions {
  entry: ZoneEntry;
  playerClass: PlayerClass;
  costume: Costume;
  name: string;
  // Whether the paid zones are open to you, so a locked portal can say so before you try it.
  owned: boolean;
  onProgress?: (done: number, total: number) => void;
  // Walking into a portal asks to go through.
  onTravel: (to: ZoneId) => void;
  // Talking to a village NPC (E, the pad's button, or arriving where you were sent).
  onTalk: (id: NpcId) => void;
}

// One zone of the open world on screen: the forest and its portals, you (over the shoulder) and the
// others and the monsters in your channel. Moving, jumping, guarding, attacking and your skill are
// drawn here and sent through the WorldClient; the server decides what they hit. Auto-battle (its button)
// walks you to the nearest monster, fights it and uses your skill when it helps.
export class WorldView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, VIEW_FAR);
  private readonly clock = new THREE.Clock();
  private readonly input: FpsInput;
  private readonly effects = new Effects(this.scene);
  private readonly others = new Map<string, { actor: PlayerActor; key: string }>();
  private readonly monsters = new Map<string, MonsterActor>();
  private readonly npcs: { id: NpcId; actor: NpcActor; at: Point2 }[] = [];
  // Where you were sent to walk (to an NPC), and whom to talk to on arrival.
  private walkGoal: { to: Point2; talk: NpcId | null } | null = null;
  private readonly hudListeners = new Set<(hud: WorldHud) => void>();
  private readonly layout: LevelLayout;
  private readonly portals: Portal[];
  private readonly walls: SolidTest;
  private readonly resizeObserver: ResizeObserver;
  private resizeFrame = 0;
  private library: ModelLibrary | null = null;
  private me: PlayerActor | null = null;
  private pose: Pose;
  private air: Airborne = GROUNDED;
  private yaw = 0;
  private pitch = 0;
  private swings = 0;
  private skills = 0;
  private lastAttackAt = Number.NEGATIVE_INFINITY;
  // When each skill slot was last used, and which one went last (others see it by the slot).
  private readonly lastSkillAt = SKILLS.warrior.map(() => Number.NEGATIVE_INFINITY);
  private lastSlot = 0;
  private bodies: Body[] = [];
  // No portal takes you until you have walked clear of the one you came through.
  private portalArmed = false;
  private travelling = false;
  private lastHudAt = Number.NEGATIVE_INFINITY;
  private auto = false;
  private target: string | null = null;
  // Hunting for a quest: the kinds it asks for, and the route to the nearest one.
  private questSeek: MonsterType[] | null = null;
  private route: { points: Point2[]; at: number } | null = null;
  // Where auto-battle last made headway, and the monsters it gave up on (until when).
  private stuckSince: { x: number; z: number; at: number } | null = null;
  private readonly unreachable = new Map<string, number>();
  private gain: { xp: number; at: number } | null = null;
  private notes: { text: string; at: number }[] = [];
  private lastPotionAt = Number.NEGATIVE_INFINITY;
  // Your health last frame, to show what a blow took; the monsters your last skill hit, whose next
  // loss of health shows as a big number.
  private lastHp: number | null = null;
  private skillHits = new Map<string, number>();
  // When you were last hurt, for the red flash at the screen's edge.
  private hurtAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private disposed = false;

  private readonly isSolid = (x: number, z: number) =>
    this.walls(x, z) || platformBlocks(this.layout.platforms, x, z, this.air.y) || crowdBlocks(this.bodies, this.pose, x, z);

  constructor(
    private readonly container: HTMLElement,
    private readonly client: WorldClient,
    private readonly options: WorldViewOptions,
  ) {
    this.layout = zoneLayout(options.entry.zone);
    this.portals = portalsOf(options.entry.zone);
    this.walls = solidWith(this.layout, Infinity);
    this.pose = { x: options.entry.x, z: options.entry.z, yaw: 0 };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.input = new FpsInput(this.renderer.domElement);
    this.scene.add(this.camera);
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.resize());
    });
    this.resizeObserver.observe(container);
    this.resize();
  }

  async start(): Promise<void> {
    const library = await ModelLibrary.load();
    const npcModels = this.options.entry.zone === START_ZONE ? NPC_MODELS : [];
    await library.preload([...WORLD_MODELS, ...zoneMonsterModels(this.options.entry.zone), ...npcModels], this.options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.library = library;
    buildLevelScene(this.scene, library, this.layout);
    this.addPortals();
    // Your own name stays off: the camera is right behind you and it would only cover the view.
    this.me = this.hero(this.options.playerClass, this.options.costume);
    if (this.options.entry.zone === START_ZONE) this.addNpcs();
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  // For checking the game from the browser console in development.
  debugHandle(): {
    pose: () => Pose; setPose: (p: { x: number; z: number; yaw?: number }) => void; npcs: () => unknown; zone: string;
  } {
    return {
      zone: this.options.entry.zone,
      npcs: () => this.npcs.map((n) => ({ id: n.id, at: n.at, shown: n.actor.object.visible, pos: n.actor.object.position.toArray() })),
      pose: () => ({ ...this.pose }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw ?? this.yaw };
        if (p.yaw !== undefined) this.yaw = p.yaw;
      },
    };
  }

  // Auto-battle on or off (the HUD button).
  toggleAuto(): void {
    this.auto = !this.auto;
    this.questSeek = null;
    this.route = null;
    if (!this.auto) this.target = null;
  }

  // Goes hunting for the monsters a quest asks for: auto-battle walks to the nearest of those kinds,
  // wherever it stands in the zone, and fights them until told otherwise.
  seekQuest(types: readonly MonsterType[]): void {
    if (!Object.values(this.client.state.monsters).some((m) => types.includes(m.type))) {
      const zones = ZONE_IDS.filter((z) => ZONE_MONSTERS[z].some((t) => types.includes(t)) || types.includes(ZONE_BOSS[z]!));
      this.notes.push({ text: `이 구역에는 없어요${zones.length ? ` (${zones.map((z) => ZONES[z].name).join(", ")})` : ""}`, at: performance.now() });
      return;
    }
    this.questSeek = [...types];
    this.route = null;
    this.target = null;
    this.auto = true;
  }

  // Walks you to a village NPC and opens the talk on arrival (the quest tracker's report).
  walkToNpc(id: NpcId): void {
    if (this.options.entry.zone !== START_ZONE) return;
    this.walkGoal = { to: npcSpot(id), talk: id };
    this.auto = false;
    this.questSeek = null;
    this.route = null;
  }

  // The on-screen buttons: a skill or the potion by tap, a jump, talking to the NPC close by.
  talk(): void {
    const id = npcNear(this.pose.x, this.pose.z);
    if (id) this.options.onTalk(id);
  }

  tapSkill(slot: number): void {
    this.input.press(SKILL_KEYS[slot]);
  }

  tapPotion(): void {
    this.input.press("KeyQ");
  }

  tapJump(): void {
    this.input.press("Space");
  }

  // The on-screen joystick and look area feed the same input as the keyboard and mouse.
  get controls(): FpsInput {
    return this.input;
  }

  onHud(cb: (hud: WorldHud) => void): () => void {
    this.hudListeners.add(cb);
    return () => {
      this.hudListeners.delete(cb);
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.effects.dispose();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.hudListeners.clear();
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const state = this.client.state;

    const look = this.input.consumeLook();
    const view = applyLook(this.yaw, this.pitch, look.dx, look.dy, LOOK_SENSITIVITY * settings().sensitivity);
    this.renderer.toneMappingExposure = settings().brightness;
    this.yaw = view.yaw;
    this.pitch = view.pitch;

    const dead = state.me?.dead === true;
    const here = state.phase === "in" && !this.travelling && !dead;
    // Mid-swing you stand still (and turn only through the attack itself).
    const rooted = this.me?.rooted === true;
    const potion = this.input.consumePress("KeyQ");
    if (this.input.consumePress("KeyE")) this.talk();
    const autoPotion = this.auto && settings().autoPotion && !!state.me && state.me.hp < state.me.maxHp * AUTO_POTION_BELOW;
    if (here && (potion || autoPotion)) this.drinkPotion();
    let facingYaw = this.yaw;
    if (here) {
      this.bodies = state.others.map((o) => ({ x: o.pose.x, z: o.pose.z, r: PLAYER_BODY * 2 }));
      for (const m of Object.values(state.monsters)) {
        if (m.alive) this.bodies.push({ x: m.x, z: m.z, r: PLAYER_BODY + MONSTERS[m.type].body });
      }
      for (const npc of this.npcs) this.bodies.push({ x: npc.at.x, z: npc.at.z, r: PLAYER_BODY * 2 });
      const speed = WALK_SPEED * (this.input.blocking ? GUARD_WALK : 1);
      const move = this.input.moveInput();
      const idle = move.forward === 0 && move.strafe === 0;
      // Your own steps cancel a walk you were sent on.
      if (!idle) this.walkGoal = null;
      const chase = idle && this.walkGoal ? this.walkTo(this.walkGoal) : this.auto && idle ? this.autoChase(state.monsters) : null;
      if (rooted) {
        facingYaw = chase ? chase.yaw : this.pose.yaw;
      } else if (chase) {
        facingYaw = chase.yaw;
        // The camera swings round behind you to the fight, unless you are looking about yourself.
        if (look.dx === 0) {
          let turn = (chase.yaw - this.yaw) % (2 * Math.PI);
          if (turn > Math.PI) turn -= 2 * Math.PI;
          if (turn < -Math.PI) turn += 2 * Math.PI;
          this.yaw += turn * (1 - Math.exp(-dt * AUTO_CAMERA_RATE));
        }
        if (chase.walk) this.pose = stepAround({ ...this.pose, yaw: chase.yaw }, chase.yaw, dt, this.isSolid, speed);
      } else {
        this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, move, dt, this.isSolid, speed);
      }
    }
    const jump = this.input.consumePress("Space");
    const ground = groundAt(this.layout.platforms, this.pose.x, this.pose.z, PLAYER_RADIUS);
    this.air = here ? stepJump(this.air, jump, dt, ground) : GROUNDED;
    facingYaw = this.handleActions(here, state.monsters, facingYaw);
    this.pose = {
      ...this.pose, yaw: facingYaw, y: this.air.y, block: here && this.input.blocking, swing: this.swings, skill: this.skills,
      slot: this.lastSlot,
    };
    if (here) this.client.reportPose(this.pose);
    this.checkPortals(here);

    this.showHurt(state.me?.hp ?? null);
    this.syncActors(state.others, dt, dead);
    this.syncMonsters(state.monsters, dt);
    this.effects.update(dt);
    const cam = chaseCamera(this.pose, this.yaw, this.pitch, this.walls, SKY_CEILING);
    this.camera.position.set(cam.x, cam.y, cam.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.emitHud();
    this.renderer.render(this.scene, this.camera);
  };

  // Where auto-battle goes: toward the monster it is fighting (or the nearest one it can find), and
  // whether it still has to walk to reach it. Hunting for a quest, it picks the nearest of the asked
  // kinds anywhere in the zone and follows a route through the groves to it. Null when there is
  // nothing to fight.
  private autoChase(monsters: Record<string, MonsterState>): { yaw: number; walk: boolean } | null {
    const current = this.target ? monsters[this.target] : undefined;
    const now = performance.now();
    // A monster it could not get to is left alone for a while.
    for (const [id, until] of this.unreachable) if (until <= now) this.unreachable.delete(id);
    if (this.target && this.stuckFor(now) > STUCK_GIVE_UP_MS) {
      this.unreachable.set(this.target, now + UNREACHABLE_MS);
      this.target = null;
      this.route = null;
    }
    const wanted = (m: MonsterState, id: string) =>
      m.alive && !this.unreachable.has(id) && (!this.questSeek || this.questSeek.includes(m.type));
    if (!current || !wanted(current, this.target!) || (!this.questSeek && this.distanceTo(current) > AUTO_DROP)) {
      this.target = null;
      this.route = null;
      let best = this.questSeek ? Infinity : AUTO_SEEK;
      for (const [id, m] of Object.entries(monsters)) {
        const d = this.distanceTo(m);
        if (wanted(m, id) && d < best) {
          best = d;
          this.target = id;
        }
      }
    }
    const m = this.target ? monsters[this.target] : undefined;
    if (!m) return null;
    const reach = WEAPONS[this.options.playerClass].reach;
    const d = this.distanceTo(m);
    if (d <= reach * AUTO_CLOSE) {
      this.stuckSince = null;
      return { yaw: this.yawTo(m), walk: false };
    }
    // Straight at it when nothing stands between; otherwise by the route round the groves (walked
    // corner to corner), worked out again every so often and at once when it gets stuck.
    if (lineClear(this.layout, this.pose, m, PLAYER_RADIUS + 0.1)) {
      this.route = null;
      return { yaw: this.yawTo(m), walk: true };
    }
    const stuck = this.stuckFor(now) > STUCK_REROUTE_MS;
    if (!this.route || now - this.route.at > ROUTE_MS || stuck) {
      const points = gridRoute(this.layout, this.pose, m);
      this.route = points ? { points, at: now } : null;
    }
    const points = this.route?.points;
    if (!points || points.length === 0) return { yaw: this.yawTo(m), walk: true };
    while (points.length > 1 && this.distanceTo(points[0]) < WAYPOINT_REACH) points.shift();
    return { yaw: this.yawTo(points[0]), walk: true };
  }

  // Heading for a spot you were sent to: straight when clear, by the route otherwise. On arrival the
  // walk ends (and the talk it was for opens).
  private walkTo(goal: { to: Point2; talk: NpcId | null }): { yaw: number; walk: boolean } | null {
    if (this.distanceTo(goal.to) <= TALK_ARRIVE) {
      this.walkGoal = null;
      this.route = null;
      if (goal.talk) this.options.onTalk(goal.talk);
      return null;
    }
    if (lineClear(this.layout, this.pose, goal.to, PLAYER_RADIUS + 0.1)) return { yaw: this.yawTo(goal.to), walk: true };
    const now = performance.now();
    if (!this.route || now - this.route.at > ROUTE_MS) {
      const points = gridRoute(this.layout, this.pose, goal.to);
      this.route = points ? { points, at: now } : null;
    }
    const points = this.route?.points;
    if (!points || points.length === 0) return { yaw: this.yawTo(goal.to), walk: true };
    while (points.length > 1 && this.distanceTo(points[0]) < WAYPOINT_REACH) points.shift();
    return { yaw: this.yawTo(points[0]), walk: true };
  }

  // The village's people, each their own model, their name and role in gold overhead, standing
  // turned toward where you arrive.
  private addNpcs(): void {
    const library = this.library!;
    const spawn = this.layout.playerSpawn;
    for (const npc of NPCS) {
      const at = npcSpot(npc.id);
      const yaw = Math.atan2(-(spawn.x - at.x), -(spawn.z - at.z));
      const actor = new NpcActor(
        library.instance(npc.model), library.get(npc.model).animations, npc, `${npc.name} · ${npc.role}`, at.x, at.z, yaw,
      );
      this.scene.add(actor.object);
      this.npcs.push({ id: npc.id, actor, at });
    }
  }

  // How long auto-battle has been walking without getting anywhere, in ms.
  private stuckFor(now: number): number {
    const at = { x: this.pose.x, z: this.pose.z };
    if (!this.stuckSince || Math.hypot(at.x - this.stuckSince.x, at.z - this.stuckSince.z) > STUCK_DISTANCE) {
      this.stuckSince = { ...at, at: now };
      return 0;
    }
    return now - this.stuckSince.at;
  }

  private distanceTo(p: { x: number; z: number }): number {
    return Math.hypot(p.x - this.pose.x, p.z - this.pose.z);
  }

  // yaw 0 faces -z.
  private yawTo(p: { x: number; z: number }): number {
    return Math.atan2(-(p.x - this.pose.x), -(p.z - this.pose.z));
  }

  // The monster a blow from here lands on: the nearest one in your arc; failing that, the nearest in
  // reach not far round from where you look (you turn to it).
  private aim(monsters: Record<string, MonsterState>, yaw: number): string | null {
    const weapon = WEAPONS[this.options.playerClass];
    let best: { id: string; score: number } | null = null;
    for (const [id, m] of Object.entries(monsters)) {
      if (!m.alive) continue;
      const d = this.distanceTo(m);
      if (d > weapon.reach || !facing({ ...this.pose, yaw }, m, AIM_ASSIST)) continue;
      const score = inStrikeReach({ ...this.pose, yaw }, m, weapon) ? d : d + 100;
      if (!best || score < best.score) best = { id, score };
    }
    return best?.id ?? null;
  }

  // A click attacks (a bow or a staff shoots), keys 1 to 3 use the class's skills; in auto-battle
  // they all go by themselves. Returns where you face (toward what you hit).
  private handleActions(here: boolean, monsters: Record<string, MonsterState>, yaw: number): number {
    const pressed = SKILL_KEYS.map((key) => this.input.consumePress(key));
    if (!here || this.input.blocking) return yaw;
    const now = performance.now();
    const c = this.options.playerClass;
    const weapon = WEAPONS[c];
    const chasing = this.auto && this.target && monsters[this.target]?.alive ? this.target : null;
    const inReach = chasing && this.distanceTo(monsters[chasing]) <= weapon.reach ? chasing : null;
    const firing = this.input.consumePress("VirtualFire") || this.input.firing;
    if ((firing || inReach) && now - this.lastAttackAt >= weapon.intervalMs) {
      const target = inReach ?? this.aim(monsters, yaw);
      if (target) yaw = this.yawTo(monsters[target]);
      this.lastAttackAt = now;
      this.swings += 1;
      const shot = HEROES[c].shot;
      if (shot) playShot(shot);
      else playSwing();
      if (target) void this.client.strike(target, yaw).then((r) => this.gained(r));
    }
    if (now - Math.max(...this.lastSkillAt) < SKILL_GAP_MS) return yaw;
    // The bar's slots hold skills; a key or auto-battle picks a slot, and the skill in it is used.
    const bar = hotbarFor(c);
    const ready = (index: number | null): index is number =>
      index !== null && this.skillOpen(SKILLS[c][index]) && now - this.lastSkillAt[index] >= SKILLS[c][index].cooldownMs;
    let slot = pressed.findIndex((p, i) => p && ready(bar[i]));
    // Auto-battle reaches for the strongest skill it may use that would help.
    if (slot < 0 && this.auto) {
      const allowed = settings().autoSkills;
      let bestDamage = -1;
      bar.forEach((index, i) => {
        if (allowed[i] && ready(index) && SKILLS[c][index].damage + SKILLS[c][index].heal > bestDamage
          && this.skillHelps(SKILLS[c][index], monsters, yaw)) {
          bestDamage = SKILLS[c][index].damage + SKILLS[c][index].heal;
          slot = i;
        }
      });
    }
    const index = slot < 0 ? null : bar[slot];
    if (index === null) return yaw;
    const skill = SKILLS[c][index];
    const target = this.aim(monsters, yaw);
    if (target && skill.damage > 0) yaw = this.yawTo(monsters[target]);
    this.lastSkillAt[index] = now;
    this.lastSlot = index;
    this.skills += 1;
    playSkill();
    void this.client.useSkill(index, yaw).then((r) => {
      for (const id of r?.hit ?? []) this.skillHits.set(id, performance.now());
      this.gained(r);
    });
    return yaw;
  }

  private skillOpen(skill: Skill): boolean {
    return levelOf(this.client.state.me?.xp ?? 0).level >= skill.level;
  }

  // Whether auto-battle should use a skill now: a heal when hurt, anything else when it would hit.
  private skillHelps(skill: Skill, monsters: Record<string, MonsterState>, yaw: number): boolean {
    const me = this.client.state.me;
    const hurt = !!me && me.hp < me.maxHp * AUTO_HEAL_BELOW;
    const hits = skill.damage > 0 && skillTargets({ ...this.pose, yaw }, monsters, skill).length > 0;
    return skill.heal > 0 ? hurt || hits : hits;
  }

  private gained(result: HitResult | null): void {
    if (!result) return;
    const now = performance.now();
    if (result.xp > 0) {
      const recent = this.gain && now - this.gain.at < GAIN_MS ? this.gain.xp : 0;
      this.gain = { xp: recent + result.xp, at: now };
    }
    if (result.gold > 0) this.notes.push({ text: `+${result.gold} 골드`, at: now });
    for (const id of result.items) this.notes.push({ text: `${ITEMS[id]?.name ?? id} 획득`, at: now });
  }

  // Drinks the potion that fits: the big one when a lot is missing, otherwise the small one.
  private drinkPotion(): void {
    const now = performance.now();
    const me = this.client.state.me;
    const bag = this.client.state.bag?.bag;
    if (!me || !bag || me.hp >= me.maxHp || now - this.lastPotionAt < POTION_GAP_MS) return;
    const missing = me.maxHp - me.hp;
    const big = (bag.potion_big ?? 0) > 0;
    const small = (bag.potion_small ?? 0) > 0;
    const pick = big && (missing >= ITEMS.potion_big.heal || !small) ? "potion_big" : small ? "potion_small" : null;
    if (!pick) return;
    this.lastPotionAt = now;
    void this.client.drink(pick);
  }

  private checkPortals(here: boolean): void {
    const near = this.nearestPortal();
    if (!near || near.d > PORTAL_REARM) this.portalArmed = true;
    if (!here || !this.portalArmed || !near || near.d > PORTAL_RADIUS) return;
    this.portalArmed = false;
    this.travelling = true;
    this.options.onTravel(near.portal.to);
  }

  // The view hears back when a trip through a portal was refused, so you can walk again.
  travelRefused(): void {
    this.travelling = false;
  }

  private nearestPortal(): { portal: Portal; d: number } | null {
    let best: { portal: Portal; d: number } | null = null;
    for (const portal of this.portals) {
      const d = Math.hypot(portal.x - this.pose.x, portal.z - this.pose.z);
      if (!best || d < best.d) best = { portal, d };
    }
    return best;
  }

  private hero(playerClass: PlayerClass, costume: Costume): PlayerActor {
    const library = this.library!;
    const rig = HEROES[playerClass];
    const actor = new PlayerActor("", {
      object: library.instance(rig.model), clips: library.get(rig.model).animations, costume, rig, effects: this.effects,
    });
    this.scene.add(actor.object);
    return actor;
  }

  private syncActors(others: OtherPlayer[], dt: number, dead: boolean): void {
    if (!this.library) return;
    // The camera sits behind you, so your own body is drawn from your local pose.
    this.me?.sync(this.pose, dead ? "dead" : "active", dt);
    for (const npc of this.npcs) {
      npc.actor.sync(dt, this.distanceTo(npc.at), this.camera.position.distanceTo(npc.actor.object.position));
    }
    const seen = new Set<string>();
    for (const other of others) {
      seen.add(other.account);
      const key = `${other.look.playerClass}|${other.look.costume}`;
      let entry = this.others.get(other.account);
      if (entry && entry.key !== key) {
        this.scene.remove(entry.actor.object);
        entry = undefined;
      }
      if (!entry) {
        const playerClass = (HEROES as Record<string, unknown>)[other.look.playerClass] ? other.look.playerClass as PlayerClass : "warrior";
        const actor = this.hero(playerClass, costumeById(other.look.costume) ?? this.options.costume);
        entry = { actor, key };
        this.others.set(other.account, entry);
      }
      entry.actor.label(`Lv${other.look.level} ${other.look.job ? `${other.look.job} ` : ""}${other.look.name}`);
      entry.actor.sync(other.pose, "active", dt);
      entry.actor.fadeLabel(this.camera.position.distanceTo(entry.actor.object.position));
    }
    for (const [account, entry] of this.others) {
      if (seen.has(account)) continue;
      this.scene.remove(entry.actor.object);
      this.others.delete(account);
    }
  }

  // What a blow took off you, in red over your head, with a flash at the screen's edge.
  private showHurt(hp: number | null): void {
    if (hp !== null && this.lastHp !== null && hp < this.lastHp && this.me) {
      const at = new THREE.Vector3(this.pose.x, 2.1, this.pose.z);
      this.effects.floatText(at, `-${Math.round(this.lastHp - hp)}`, "#ff5a4a");
      this.hurtAt = performance.now();
    }
    this.lastHp = hp;
  }

  private syncMonsters(monsters: Record<string, MonsterState>, dt: number): void {
    const library = this.library;
    if (!library) return;
    for (const [id, state] of Object.entries(monsters)) {
      let actor = this.monsters.get(id);
      if (!actor) {
        const skin = MONSTER_SKINS[state.type];
        actor = new MonsterActor(id, library.instance(skin.model), library.get(skin.model).animations, skin.look, MONSTERS[state.type].hp);
        this.monsters.set(id, actor);
        this.scene.add(actor.object);
      }
      if (!state.alive) this.skillHits.delete(id);
      // Blows come from the nearest hunter; near you, that is almost always you.
      actor.hitFrom(this.pose.x, this.pose.z);
      const change = actor.sync(state, dt, this.camera);
      const at = new THREE.Vector3(actor.object.position.x, actor.height + 0.2, actor.object.position.z);
      if (change.damage > 0) {
        const skillAt = this.skillHits.get(id);
        const big = skillAt !== undefined && performance.now() - skillAt < SKILL_NUMBER_MS;
        if (big) this.skillHits.delete(id);
        this.effects.floatText(at, String(Math.round(change.damage)), big ? "#ffb347" : "#fff4dc", big);
      }
      if (change.died) this.effects.burst(new THREE.Vector3(actor.object.position.x, 0, actor.object.position.z), 0xfff1c9);
      if (change.slammed) {
        const ground = new THREE.Vector3(actor.object.position.x, 0, actor.object.position.z);
        this.effects.ring(ground, BOSS_MOVES.slamRadius, 0xff7a3a);
        this.effects.burst(ground, 0xc9a27a);
      }
    }
    for (const [id, actor] of this.monsters) {
      if (monsters[id]) continue;
      this.scene.remove(actor.object);
      this.monsters.delete(id);
    }
  }

  // Each portal: a glowing ring on the ground, a column of light, and the name of where it leads.
  private addPortals(): void {
    for (const portal of this.portals) {
      const locked = (ZONES[portal.to].paid && !this.options.owned) || levelOf(this.client.state.me?.xp ?? 0).level < ZONES[portal.to].minLevel;
      const color = locked ? 0xff8a5c : 0x8fe3ff;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(PORTAL_RADIUS - 0.25, PORTAL_RADIUS, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.position.set(portal.x, 0.06, portal.z);
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(PORTAL_RADIUS * 0.8, PORTAL_RADIUS * 0.8, 3, 24, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      );
      column.position.set(portal.x, 1.5, portal.z);
      const label = createLabel(2.6);
      label.position.set(portal.x, 3.3, portal.z);
      const why = ZONES[portal.to].paid && !this.options.owned ? " (정식판)" : locked ? ` (Lv${ZONES[portal.to].minLevel})` : "";
      setLabel(label, `${ZONES[portal.to].name}${why}`, locked ? "#ffb08a" : "#bff0ff");
      this.scene.add(ring, column, label);
    }
  }

  private emitHud(): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    this.notes = this.notes.filter((n) => now - n.at < NOTE_MS).slice(-4);
    const entry = this.client.state.entry ?? this.options.entry;
    const near = this.nearestPortal();
    const me = this.client.state.me;
    const level = levelOf(me?.xp ?? 0);
    const fighting = this.target ? this.client.state.monsters[this.target] : undefined;
    const hud: WorldHud = {
      zone: ZONES[entry.zone].name,
      channel: entry.channel,
      portal: near && near.d <= PORTAL_REARM + 2
        ? {
          to: ZONES[near.portal.to].name, locked: ZONES[near.portal.to].paid && !this.options.owned,
          needLevel: level.level < ZONES[near.portal.to].minLevel ? ZONES[near.portal.to].minLevel : null,
        }
        : null,
      skills: hotbarFor(this.options.playerClass).map((index) => {
        if (index === null) return null;
        const skill = SKILLS[this.options.playerClass][index];
        return {
          skill: index, name: skill.name, cooldownMs: skill.cooldownMs, level: skill.level, open: level.level >= skill.level,
          readyInMs: Math.max(0, this.lastSkillAt[index] + skill.cooldownMs - now),
        };
      }),
      blocking: !!this.pose.block,
      hp: me?.hp ?? 0,
      maxHp: me?.maxHp ?? 1,
      dead: me?.dead === true,
      level: level.level,
      xpInto: level.into,
      xpNeed: level.need,
      gain: this.gain && now - this.gain.at < GAIN_MS ? this.gain.xp : null,
      auto: this.auto,
      seeking: this.auto && this.questSeek !== null,
      npc: (() => {
        const id = npcNear(this.pose.x, this.pose.z);
        const npc = id ? NPCS.find((n) => n.id === id)! : null;
        return npc ? { id: npc.id, name: npc.name, role: npc.role } : null;
      })(),
      target: fighting?.alive ? { name: `Lv${MONSTERS[fighting.type].level} ${MONSTERS[fighting.type].name}`, hp: fighting.hp, maxHp: MONSTERS[fighting.type].hp } : null,
      potions: (this.client.state.bag?.bag.potion_small ?? 0) + (this.client.state.bag?.bag.potion_big ?? 0),
      hurt: Math.max(0, 1 - (now - this.hurtAt) / HURT_FLASH_MS),
      notes: this.notes.map((n) => n.text),
    };
    for (const listener of this.hudListeners) listener(hud);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
