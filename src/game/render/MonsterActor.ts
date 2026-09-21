import * as THREE from "three";
import type { MonsterState } from "../world/monsters";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";
import { playHit } from "../audio/sfx";

const HIT_FLASH_SECONDS = 0.08;
const FOLLOW_RATE = 12;
// Without a death take, a fallen monster sinks into the ground over this long.
const SINK_SECONDS = 0.8;
const BAR_WIDTH = 0.9;

// How a monster model is drawn: its standing height in metres, an optional colour tint, and the
// names of its clips (they differ from pack to pack). A null death means it just sinks away.
export interface MonsterLook {
  height: number;
  tint: number | null;
  clips: { idle: string; walk: string; attack: string; death: string | null };
}

// A monster on screen: follows its state, walks, swings when its attack clock moves on, flashes
// when hit, falls when it dies and stands up again where it started when it comes back. A health
// bar floats over it once it has been hurt.
export class MonsterActor {
  readonly object: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly attack: THREE.AnimationAction;
  private readonly death: THREE.AnimationAction | null;
  private readonly blender: ActionBlender;
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly attackSeconds: number;
  private readonly bar: THREE.Group;
  private readonly barFill: THREE.Mesh;
  private flashLeft = 0;
  private attackLeft = 0;
  private sinkLeft = 0;
  private lastHp: number | null = null;
  private lastAttackReadyAt: number | null = null;
  private dead = false;
  private placed = false;

  constructor(readonly id: string, readonly body: THREE.Object3D, clips: THREE.AnimationClip[], look: MonsterLook, private readonly maxHp = 100) {
    body.scale.setScalar(look.height / skinnedHeight(body));
    this.materials = ownMaterials(body);
    if (look.tint !== null) {
      const tint = new THREE.Color(look.tint);
      for (const m of this.materials) m.color.multiply(tint);
    }
    this.mixer = new THREE.AnimationMixer(body);
    this.idle = this.mixer.clipAction(clipByName(clips, look.clips.idle));
    this.walk = this.mixer.clipAction(clipByName(clips, look.clips.walk));
    this.attack = this.mixer.clipAction(clipByName(clips, look.clips.attack));
    this.attack.setLoop(THREE.LoopOnce, 1);
    this.attackSeconds = this.attack.getClip().duration;
    this.death = look.clips.death ? this.mixer.clipAction(clipByName(clips, look.clips.death)) : null;
    if (this.death) {
      this.death.setLoop(THREE.LoopOnce, 1);
      this.death.clampWhenFinished = true;
    }
    this.blender = new ActionBlender(this.idle);

    // The health bar: a dark back and a red fill, always facing the camera (see sync).
    this.bar = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, 0.1), new THREE.MeshBasicMaterial({ color: 0x1a1210, depthTest: false }));
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, 0.07), new THREE.MeshBasicMaterial({ color: 0xe0463a, depthTest: false }));
    this.barFill.position.z = 0.001;
    back.renderOrder = 10;
    this.barFill.renderOrder = 11;
    this.bar.add(back, this.barFill);
    this.bar.position.y = look.height + 0.35;
    this.bar.visible = false;
    this.object = new THREE.Group();
    this.object.add(body, this.bar);
  }

  sync(state: MonsterState, dt: number, camera: THREE.Camera | null): void {
    const p = this.object.position;
    // Back from the dead: standing where it started.
    if (state.alive && this.dead) {
      this.dead = false;
      this.placed = false;
      this.sinkLeft = 0;
      this.body.position.y = 0;
      this.blender.fadeTo(this.idle, 0);
    }
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
    this.body.rotation.y = state.yaw + Math.PI;

    if (this.lastHp !== null && state.hp < this.lastHp) {
      this.flashLeft = HIT_FLASH_SECONDS;
      playHit();
    }
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
      if (this.death) this.blender.fadeTo(this.death, 0.1);
      else this.sinkLeft = SINK_SECONDS;
    } else if (!this.dead && this.attackLeft === 0) {
      this.blender.fadeTo(Math.hypot(dx, dz) > 0.03 ? this.walk : this.idle);
    }
    if (this.dead && !this.death) {
      this.sinkLeft = Math.max(0, this.sinkLeft - dt);
      this.body.position.y = -(1 - this.sinkLeft / SINK_SECONDS) * 1.2;
    }

    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const glow = this.flashLeft > 0 ? 1.5 : 0;
    for (const m of this.materials) m.emissive.setRGB(glow, glow * 0.2, glow * 0.2);

    const share = Math.max(0, Math.min(1, state.hp / this.maxHp));
    this.bar.visible = state.alive && share < 1;
    if (this.bar.visible) {
      this.barFill.scale.x = Math.max(0.001, share);
      this.barFill.position.x = -(BAR_WIDTH * (1 - share)) / 2;
      if (camera) this.bar.quaternion.copy(camera.quaternion);
    }
    this.mixer.update(dt);
  }
}
