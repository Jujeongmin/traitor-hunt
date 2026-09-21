import * as THREE from "three";
import type { Pose } from "../world/types";
import type { Costume } from "./costumes";
import { applyCostume } from "./dyes";
import type { HeroRig } from "./heroes";
import type { Effects } from "./effects";
import { createLabel, setLabel } from "./labels";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

// The heroes stand a little shorter than a person; the camera and reach are set around this.
export const PLAYER_HEIGHT = 1.45;
const FOLLOW_RATE = 12;
const FALL_RATE = 6;
// Still this far from where the pose says (metres) counts as walking.
const MOVING = 0.03;

export type PlayerStatus = "active" | "dead";

export interface PlayerModel {
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
  costume: Costume;
  // The class's model and which of its clips to play.
  rig: HeroRig;
  // Where shots and skill rings are drawn; none on the menu.
  effects?: Effects;
}

// A bow or a staff lets go this long after the attack starts.
const RELEASE_SECONDS = 0.25;
// Shots leave from about chest height.
const SHOT_HEIGHT = 0.9;
// An attack or skill holds you in place this long (at most its clip); moving after that cuts the rest
// of the clip short, so a hero never slides along the ground mid-swing.
const ATTACK_COMMIT = 0.45;
const SKILL_COMMIT = 0.8;

interface Animated {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
  attacks: THREE.AnimationAction[];
  guard: THREE.AnimationAction;
  death: THREE.AnimationAction;
  skill: THREE.AnimationAction;
  blender: ActionBlender;
}

// Stand-in body for tests and for a model that failed to load.
export function placeholderBody(): THREE.Object3D {
  const root = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 12), cloth);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), cloth);
  head.position.y = 1.15;
  root.add(body, head);
  return root;
}

function once(action: THREE.AnimationAction, clamp: boolean): THREE.AnimationAction {
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = clamp;
  return action;
}

// A hero in the match or on the menu: follows its pose, walks in the direction it moves, swings when
// its swing count goes up, raises its guard while blocking and falls when it goes down.
export class PlayerActor {
  readonly object: THREE.Object3D;
  private readonly body: THREE.Object3D;
  private readonly animated: Animated | null;
  private readonly tag = createLabel(1.8);
  private tagText = "";
  private placed = false;
  private dead = false;
  private lastSwing: number | null = null;
  private lastSkill: number | null = null;
  private readonly rig: HeroRig | null;
  private readonly effects: Effects | null;
  // Shots waiting for the bow or staff to let go: seconds left, and how far each flies.
  private pendingShots: { left: number; reach: number }[] = [];
  private swingLeft = 0;
  private commitLeft = 0;
  private nextAttack = 0;

  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.tag.position.y = PLAYER_HEIGHT + 0.35;
    this.object.add(this.body, this.tag);
    this.animated = model ? PlayerActor.animate(model) : null;
    this.rig = model?.rig ?? null;
    this.effects = model?.effects ?? null;
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  // Whether an attack or skill still holds this hero in place.
  get rooted(): boolean {
    return this.commitLeft > 0 && !this.dead;
  }

  // The name over the head; empty hides it.
  label(text: string, color = "#f2e8d5"): void {
    if (text === this.tagText) return;
    this.tagText = text;
    setLabel(this.tag, text, color);
  }

  private static animate({ object, clips, costume, rig }: PlayerModel): Animated {
    // Dressed first, then measured, so a cloak or pauldrons do not shrink the body.
    applyCostume(object, costume, rig);
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    const mixer = new THREE.AnimationMixer(object);
    const action = (name: string) => mixer.clipAction(clipByName(clips, name));
    const idle = action(rig.idle);
    return {
      mixer,
      idle,
      walk: action(rig.walk),
      run: action(rig.run),
      attacks: rig.attacks.map((n) => once(action(n), false)),
      guard: action(rig.guard),
      death: once(action(rig.death), true),
      skill: once(action(rig.skill), false),
      blender: new ActionBlender(idle),
    };
  }

  sync(pose: Pose | null, status: PlayerStatus, dt: number): void {
    if (!pose) {
      this.object.visible = false;
      return;
    }
    const p = this.object.position;
    if (!this.placed) {
      p.set(pose.x, 0, pose.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = pose.x - p.x;
    const dz = pose.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    // Jumps arrive a few samples per arc; the same easing keeps them smooth.
    const y = this.dead ? 0 : (pose.y ?? 0);
    p.y += (y - p.y) * k;
    // Pose yaw uses the camera convention; the model faces +z.
    this.object.rotation.y = pose.yaw + Math.PI;
    if (status === "dead") this.dead = true;

    const a = this.animated;
    if (!a) {
      if (this.dead) {
        const fall = this.body.rotation;
        fall.x += (-Math.PI / 2 - fall.x) * (1 - Math.exp(-dt * FALL_RATE));
      }
      this.object.visible = true;
      return;
    }

    // A higher swing count than last time means a new swing.
    const swing = pose.swing ?? 0;
    if (this.lastSwing !== null && swing > this.lastSwing && !this.dead) {
      const attack = a.attacks[this.nextAttack];
      this.nextAttack = (this.nextAttack + 1) % a.attacks.length;
      this.swingLeft = attack.getClip().duration;
      this.commitLeft = Math.min(this.swingLeft, ATTACK_COMMIT);
      if (a.blender.active === attack) attack.reset().play();
      else a.blender.fadeTo(attack, 0.05);
      if (this.rig?.shot) this.pendingShots.push({ left: RELEASE_SECONDS, reach: this.rig.reach });
    }
    this.lastSwing = swing;
    // Likewise a higher skill count plays the class's skill.
    const skill = pose.skill ?? 0;
    if (this.lastSkill !== null && skill > this.lastSkill && !this.dead) {
      this.swingLeft = a.skill.getClip().duration;
      this.commitLeft = Math.min(this.swingLeft, SKILL_COMMIT);
      if (a.blender.active === a.skill) a.skill.reset().play();
      else a.blender.fadeTo(a.skill, 0.05);
      if (this.rig && this.effects) this.effects.ring(p, this.rig.skillRing.radius, this.rig.skillRing.color);
      if (this.rig?.skillShot) this.pendingShots.push({ left: RELEASE_SECONDS, reach: this.rig.skillShot });
    }
    this.lastSkill = skill;
    this.fireShots(dt, pose.yaw);
    this.swingLeft = Math.max(0, this.swingLeft - dt);
    this.commitLeft = Math.max(0, this.commitLeft - dt);
    const moving = Math.hypot(dx, dz) >= MOVING;
    // Walking off once the swing has landed ends it.
    if (this.swingLeft > 0 && this.commitLeft === 0 && moving) this.swingLeft = 0;

    if (this.dead) a.blender.fadeTo(a.death, 0.1);
    else if (this.swingLeft > 0) {
      // The swing plays through.
    } else if (pose.block) a.blender.fadeTo(a.guard, 0.08);
    else a.blender.fadeTo(this.moveClip(a, dx, dz, pose.yaw));
    a.mixer.update(dt);
    this.object.visible = true;
  }

  private fireShots(dt: number, yaw: number): void {
    if (this.pendingShots.length === 0) return;
    for (const shot of this.pendingShots) shot.left -= dt;
    const ready = this.pendingShots.filter((s) => s.left <= 0);
    this.pendingShots = this.pendingShots.filter((s) => s.left > 0);
    if (!this.effects || !this.rig?.shot) return;
    const from = this.object.position.clone();
    from.y += SHOT_HEIGHT;
    for (const shot of ready) this.effects.shoot(this.rig.shot, from, yaw, shot.reach);
  }

  // Running forward or sideways, walking when backing away (the pack has no strafe clips).
  private moveClip(a: Animated, dx: number, dz: number, yaw: number): THREE.AnimationAction {
    if (Math.hypot(dx, dz) < MOVING) return a.idle;
    // Forward is (-sin yaw, -cos yaw).
    const forward = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    return forward < -MOVING / 2 ? a.walk : a.run;
  }
}
