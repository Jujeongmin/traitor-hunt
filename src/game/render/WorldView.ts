import * as THREE from "three";
import type { OtherPlayer, WorldClient } from "../../net/worldClient";
import { ModelLibrary } from "../assets/ModelLibrary";
import { WEAPONS, type PlayerClass } from "../combat/classes";
import { SKILLS } from "../combat/skills";
import { PLAYER_BODY, crowdBlocks, type Body } from "../rules/crowd";
import { solidWith, type LevelLayout } from "../rules/levelLayout";
import {
  GROUNDED, PLAYER_RADIUS, WALK_SPEED, applyLook, stepJump, stepPlayer, type Airborne, type SolidTest,
} from "../rules/movement";
import { obstacleBlocks, obstaclesFor, type Obstacle } from "../rules/obstacles";
import { groundAt, platformBlocks } from "../rules/platforms";
import { chaseCamera } from "../rules/chaseCamera";
import type { Pose } from "../world/types";
import { PORTAL_RADIUS, ZONES, portalsOf, zoneLayout, type Portal, type ZoneEntry, type ZoneId } from "../world/zones";
import { playShot, playSkill, playSwing } from "../audio/sfx";
import { costumeById, type Costume } from "./costumes";
import { Effects } from "./effects";
import { FpsInput } from "./FpsInput";
import { HEROES, HERO_MODELS } from "./heroes";
import { createLabel, setLabel } from "./labels";
import { LEVEL_MODELS, buildLevelScene } from "./levelScene";
import { LightPool } from "./lightPool";
import { PlayerActor } from "./PlayerActor";
import { settings } from "../../ui/settings";

export const LOOK_SENSITIVITY = 0.0022;
export const WORLD_MODELS = [...new Set([...LEVEL_MODELS, ...HERO_MODELS])];

// Outdoors nothing roofs the camera in; this only keeps it from flying off.
const SKY_CEILING = 30;
// Share of walking speed kept while the guard is up.
const GUARD_WALK = 0.55;
const HUD_INTERVAL_MS = 100;
const LIGHT_SLOTS = 6;
// A portal only takes you once you have stepped this far clear of it (you arrive right beside one).
const PORTAL_REARM = PORTAL_RADIUS + 0.8;

export interface WorldHud {
  zone: string;
  channel: number;
  // You and the others in this channel.
  players: number;
  portal: { to: string; locked: boolean } | null;
  skill: { name: string; readyInMs: number; cooldownMs: number };
  blocking: boolean;
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
}

// One zone of the open world on screen: the forest and its portals, you (over the shoulder) and the
// others in your channel. Moving, jumping, guarding, attacking and your skill are drawn here and sent
// through the WorldClient; what an attack hits comes with the monsters (phase 2).
export class WorldView {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 120);
  private readonly clock = new THREE.Clock();
  private readonly input: FpsInput;
  private readonly lights = new LightPool(this.scene, LIGHT_SLOTS);
  private readonly effects = new Effects(this.scene);
  private readonly others = new Map<string, { actor: PlayerActor; key: string }>();
  private readonly hudListeners = new Set<(hud: WorldHud) => void>();
  private readonly layout: LevelLayout;
  private readonly portals: Portal[];
  private readonly walls: SolidTest;
  private readonly stones: Obstacle[];
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
  private lastSkillAt = Number.NEGATIVE_INFINITY;
  private bodies: Body[] = [];
  // No portal takes you until you have walked clear of the one you came through.
  private portalArmed = false;
  private travelling = false;
  private lastHudAt = Number.NEGATIVE_INFINITY;
  private frame = 0;
  private disposed = false;

  private readonly isSolid = (x: number, z: number) =>
    this.walls(x, z) || platformBlocks(this.layout.platforms, x, z, this.air.y) || obstacleBlocks(this.stones, x, z)
    || crowdBlocks(this.bodies, this.pose, x, z);

  constructor(
    private readonly container: HTMLElement,
    private readonly client: WorldClient,
    private readonly options: WorldViewOptions,
  ) {
    this.layout = zoneLayout(options.entry.zone);
    this.portals = portalsOf(options.entry.zone);
    this.walls = solidWith(this.layout, [], Infinity);
    this.stones = obstaclesFor(this.layout);
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
    await library.preload(WORLD_MODELS, this.options.onProgress);
    // React StrictMode mounts twice; the first view may be gone by now.
    if (this.disposed) return;
    this.library = library;
    buildLevelScene(this.scene, library, this.layout, this.lights);
    this.addPortals();
    this.me = this.hero(this.options.playerClass, this.options.costume);
    this.me.label(this.options.name, "#ffd9a0");
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  // For checking the game from the browser console in development.
  debugHandle(): { pose: () => Pose; setPose: (p: { x: number; z: number; yaw?: number }) => void } {
    return {
      pose: () => ({ ...this.pose }),
      setPose: (p) => {
        this.pose = { x: p.x, z: p.z, yaw: p.yaw ?? this.yaw };
        if (p.yaw !== undefined) this.yaw = p.yaw;
      },
    };
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

    const here = state.phase === "in" && !this.travelling;
    if (here) {
      this.bodies = state.others.map((o) => ({ x: o.pose.x, z: o.pose.z, r: PLAYER_BODY * 2 }));
      const speed = WALK_SPEED * (this.input.blocking ? GUARD_WALK : 1);
      this.pose = stepPlayer({ ...this.pose, yaw: this.yaw }, this.input.moveInput(), dt, this.isSolid, speed);
    }
    const jump = this.input.consumePress("Space");
    const ground = groundAt(this.layout.platforms, this.pose.x, this.pose.z, PLAYER_RADIUS);
    this.air = here ? stepJump(this.air, jump, dt, ground) : GROUNDED;
    this.handleActions(here);
    this.pose = { ...this.pose, y: this.air.y, block: here && this.input.blocking, swing: this.swings, skill: this.skills };
    if (here) this.client.reportPose(this.pose);
    this.checkPortals(here);

    this.syncActors(state.others, dt);
    this.effects.update(dt);
    const cam = chaseCamera(this.pose, this.yaw, this.pitch, this.walls, SKY_CEILING);
    this.camera.position.set(cam.x, cam.y, cam.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    this.lights.update(this.camera.position);
    this.emitHud(state.others.length + 1);
    this.renderer.render(this.scene, this.camera);
  };

  // A click attacks (a bow or a staff shoots), key 1 uses the class's skill. Both only play for now:
  // there is nothing in the world to hit until the monsters come (phase 2).
  private handleActions(here: boolean): void {
    const pressSkill = this.input.consumePress("Digit1");
    if (!here || this.input.blocking) return;
    const now = performance.now();
    const c = this.options.playerClass;
    if (this.input.firing && now - this.lastAttackAt >= WEAPONS[c].intervalMs) {
      this.lastAttackAt = now;
      this.swings += 1;
      const shot = HEROES[c].shot;
      if (shot) playShot(shot);
      else playSwing();
    }
    if (pressSkill && now - this.lastSkillAt >= SKILLS[c].cooldownMs) {
      this.lastSkillAt = now;
      this.skills += 1;
      playSkill();
    }
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

  private syncActors(others: OtherPlayer[], dt: number): void {
    if (!this.library) return;
    // The camera sits behind you, so your own body is drawn from your local pose.
    this.me?.sync(this.pose, "active", dt);
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
      entry.actor.label(`Lv${other.look.level} ${other.look.name}`);
      entry.actor.sync(other.pose, "active", dt);
    }
    for (const [account, entry] of this.others) {
      if (seen.has(account)) continue;
      this.scene.remove(entry.actor.object);
      this.others.delete(account);
    }
  }

  // Each portal: a glowing ring on the ground, a column of light, and the name of where it leads.
  private addPortals(): void {
    for (const portal of this.portals) {
      const locked = ZONES[portal.to].paid && !this.options.owned;
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
      setLabel(label, `${ZONES[portal.to].name}${locked ? " (정식판)" : ""}`, locked ? "#ffb08a" : "#bff0ff");
      this.scene.add(ring, column, label);
    }
  }

  private emitHud(players: number): void {
    const now = performance.now();
    if (now - this.lastHudAt < HUD_INTERVAL_MS) return;
    this.lastHudAt = now;
    const entry = this.client.state.entry ?? this.options.entry;
    const near = this.nearestPortal();
    const skill = SKILLS[this.options.playerClass];
    const hud: WorldHud = {
      zone: ZONES[entry.zone].name,
      channel: entry.channel,
      players,
      portal: near && near.d <= PORTAL_REARM + 2
        ? { to: ZONES[near.portal.to].name, locked: ZONES[near.portal.to].paid && !this.options.owned }
        : null,
      skill: { name: skill.name, cooldownMs: skill.cooldownMs, readyInMs: Math.max(0, this.lastSkillAt + skill.cooldownMs - now) },
      blocking: !!this.pose.block,
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
