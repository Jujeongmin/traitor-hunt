import * as THREE from "three";
import type { Pose } from "../match/types";
import { PART_MESHES, shownMeshes, type Costume } from "./costumes";
import { applyDyes } from "./dyes";
import type { PlayerClass } from "../match/classes";
import { createLabel, setLabel } from "./labels";
import { ActionBlender, clipByName, skinnedHeight } from "./skinned";

// Chibi heroes stand a little shorter than a person; the camera and reach are set around this.
export const PLAYER_HEIGHT = 1.45;
const FOLLOW_RATE = 12;
const FALL_RATE = 6;
// Still this far from where the pose says (metres) counts as walking.
const MOVING = 0.03;

// Clip names in the RPG Tiny Hero Duo export (the pack's own spelling, "Shiled" included).
const CLIPS = {
  idle: "Idle_Battle_SwordAndShiled",
  forward: "MoveFWD_Battle_InPlace_SwordAndShield",
  back: "MoveBWD_Battle_InPlace_SwordAndShield",
  left: "MoveLFT_Battle_InPlace_SwordAndShield",
  right: "MoveRGT_Battle_InPlace_SwordAndShield",
  attacks: ["Attack01_SwordAndShiled", "Attack02_SwordAndShiled"],
  block: "Defend_SwordAndShield",
  jump: "JumpFull_Normal_InPlace_SwordAndShield",
  death: "Die01_SwordAndShield",
  // Each class's skill (see skills.ts).
  skills: { striker: "Attack04_Spinning_SwordAndShield", guardian: "Attack03_SwordAndShiled" },
} as const;

export type PlayerStatus = "active" | "dead" | "escaped";

export interface PlayerModel {
  object: THREE.Object3D;
  clips: THREE.AnimationClip[];
  costume: Costume;
  // Picks the skill clip; the striker's when left out.
  playerClass?: PlayerClass;
}

interface Animated {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  forward: THREE.AnimationAction;
  back: THREE.AnimationAction;
  left: THREE.AnimationAction;
  right: THREE.AnimationAction;
  attacks: THREE.AnimationAction[];
  block: THREE.AnimationAction;
  jump: THREE.AnimationAction;
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
// its swing count goes up, raises its shield while blocking and falls when it goes down.
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
  private swingLeft = 0;
  private nextAttack = 0;
  private jumpLeft = 0;
  private lastY = 0;

  constructor(readonly account: string, model: PlayerModel | null) {
    this.body = model?.object ?? placeholderBody();
    this.object = new THREE.Group();
    this.tag.position.y = PLAYER_HEIGHT + 0.35;
    this.object.add(this.body, this.tag);
    this.animated = model ? PlayerActor.animate(model) : null;
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
    this.object.visible = false;
  }

  // A tag over an exposed traitor or a bound player.
  mark(revealed: boolean, bound: boolean): void {
    const text = this.dead ? "" : revealed ? "배신자" : bound ? "묶임" : "";
    if (text === this.tagText) return;
    this.tagText = text;
    setLabel(this.tag, text, revealed ? "#ff6b5a" : "#ffb35a");
  }

  private static animate({ object, clips, costume, playerClass = "striker" }: PlayerModel): Animated {
    // The modular hero carries every part; hide the ones this costume does not wear. Measured after,
    // so a long cloak or a tall hairdo does not shrink the body.
    const shown = shownMeshes(costume);
    object.traverse((o) => {
      if (PART_MESHES.has(o.name)) o.visible = shown.has(o.name);
    });
    applyDyes(object, costume);
    object.scale.setScalar(PLAYER_HEIGHT / skinnedHeight(object));
    const mixer = new THREE.AnimationMixer(object);
    const action = (name: string) => mixer.clipAction(clipByName(clips, name));
    const idle = action(CLIPS.idle);
    return {
      mixer,
      idle,
      forward: action(CLIPS.forward),
      back: action(CLIPS.back),
      left: action(CLIPS.left),
      right: action(CLIPS.right),
      attacks: CLIPS.attacks.map((n) => once(action(n), false)),
      block: once(action(CLIPS.block), true),
      jump: once(action(CLIPS.jump), false),
      death: once(action(CLIPS.death), true),
      skill: once(action(CLIPS.skills[playerClass]), false),
      blender: new ActionBlender(idle),
    };
  }

  sync(pose: Pose | null, status: PlayerStatus, dt: number): void {
    if (!pose || status === "escaped") {
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
      if (a.blender.active === attack) attack.reset().play();
      else a.blender.fadeTo(attack, 0.05);
    }
    this.lastSwing = swing;
    // Likewise a higher skill count plays the class's skill.
    const skill = pose.skill ?? 0;
    if (this.lastSkill !== null && skill > this.lastSkill && !this.dead) {
      this.swingLeft = a.skill.getClip().duration;
      if (a.blender.active === a.skill) a.skill.reset().play();
      else a.blender.fadeTo(a.skill, 0.05);
    }
    this.lastSkill = skill;
    this.swingLeft = Math.max(0, this.swingLeft - dt);

    // Leaving the ground starts the jump clip once.
    if (y > this.lastY + 0.05 && this.lastY < 0.05 && this.jumpLeft === 0) this.jumpLeft = a.jump.getClip().duration;
    this.lastY = y;
    this.jumpLeft = Math.max(0, this.jumpLeft - dt);

    if (this.dead) a.blender.fadeTo(a.death, 0.1);
    else if (this.swingLeft > 0) {
      // The swing plays through.
    } else if (pose.block) a.blender.fadeTo(a.block, 0.08);
    else if (this.jumpLeft > 0) a.blender.fadeTo(a.jump, 0.08);
    else a.blender.fadeTo(this.moveClip(a, dx, dz, pose.yaw));
    a.mixer.update(dt);
    this.object.visible = true;
  }

  // Walking clip for the direction of travel relative to where the body faces.
  private moveClip(a: Animated, dx: number, dz: number, yaw: number): THREE.AnimationAction {
    if (Math.hypot(dx, dz) < MOVING) return a.idle;
    // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
    const forward = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    if (Math.abs(forward) >= Math.abs(right)) return forward >= 0 ? a.forward : a.back;
    return right >= 0 ? a.right : a.left;
  }
}
