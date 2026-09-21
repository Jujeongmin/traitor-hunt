import * as THREE from "three";
import type { MonsterState } from "../match/types";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";

const HIT_FLASH_SECONDS = 0.08;
const FOLLOW_RATE = 12;

// How a monster model is drawn: its standing height in metres, an optional colour tint, and the
// names of its clips (they differ from pack to pack).
export interface MonsterLook {
  height: number;
  tint: number | null;
  clips: { idle: string; walk: string; attack: string; death: string };
}

export class MonsterActor {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly attack: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly attackSeconds: number;
  private flashLeft = 0;
  private attackLeft = 0;
  private lastHp: number | null = null;
  private lastAttackReadyAt: number | null = null;
  private dead = false;
  private placed = false;

  constructor(readonly id: string, readonly object: THREE.Object3D, clips: THREE.AnimationClip[], look: MonsterLook) {
    object.scale.setScalar(look.height / skinnedHeight(object));
    this.materials = ownMaterials(object);
    if (look.tint !== null) {
      const tint = new THREE.Color(look.tint);
      for (const m of this.materials) m.color.multiply(tint);
    }
    this.mixer = new THREE.AnimationMixer(object);
    this.idle = this.mixer.clipAction(clipByName(clips, look.clips.idle));
    this.walk = this.mixer.clipAction(clipByName(clips, look.clips.walk));
    this.attack = this.mixer.clipAction(clipByName(clips, look.clips.attack));
    this.attack.setLoop(THREE.LoopOnce, 1);
    this.attackSeconds = this.attack.getClip().duration;
    this.death = this.mixer.clipAction(clipByName(clips, look.clips.death));
    this.death.setLoop(THREE.LoopOnce, 1);
    this.death.clampWhenFinished = true;
    this.blender = new ActionBlender(this.idle);
  }

  sync(state: MonsterState, dt: number, hidden: boolean): void {
    const p = this.object.position;
    if (!this.placed) {
      p.set(state.x, 0, state.z);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    const dx = state.x - p.x;
    const dz = state.z - p.z;
    p.x += dx * k;
    p.z += dz * k;
    // State yaw uses the camera convention; the model faces +z.
    this.object.rotation.y = state.yaw + Math.PI;

    if (this.lastHp !== null && state.hp < this.lastHp) this.flashLeft = HIT_FLASH_SECONDS;
    this.lastHp = state.hp;
    // Every attack pushes attackReadyAt forward, so a jump in it means the monster just swung.
    if (this.lastAttackReadyAt !== null && state.attackReadyAt > this.lastAttackReadyAt && state.alive) {
      this.attackLeft = this.attackSeconds;
      if (this.blender.active === this.attack) this.attack.reset().play();
      else this.blender.fadeTo(this.attack, 0.08);
    }
    this.lastAttackReadyAt = state.attackReadyAt;
    this.attackLeft = Math.max(0, this.attackLeft - dt);

    if (!state.alive && !this.dead) {
      this.dead = true;
      this.blender.fadeTo(this.death, 0.1);
    } else if (!this.dead && this.attackLeft === 0) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.walk : this.idle);
    }

    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);
    this.object.visible = !hidden;
    this.mixer.update(dt);
  }
}
