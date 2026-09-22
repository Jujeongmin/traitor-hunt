import * as THREE from "three";
import { ActionBlender, clipByName, ownMaterials, skinnedHeight } from "./skinned";
import { createLabel, setLabel } from "./labels";

// How a village NPC is drawn: its model (Quaternius, CC0), its standing height, its clips (one to
// stand in, one to greet you with when you walk up) and any colours to lay over its materials.
export interface NpcLook {
  model: string;
  height: number;
  idle: string;
  greet: string;
  // Colours laid over its materials, by material name.
  colors: Record<string, number>;
}

// Names fade out between these distances from the camera (as players' do).
const LABEL_NEAR = 10;
const LABEL_FAR = 32;
// Coming this close sets them greeting; they do it again only after you have gone this far away.
const GREET_NEAR = 6;
const GREET_RESET = 10;

// A village NPC on screen: stands in place turned toward the arrival spot, idles, and greets you
// once each time you come close, with its name and role in gold overhead.
export class NpcActor {
  readonly object = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly greet: THREE.AnimationAction;
  private readonly blender: ActionBlender;
  private readonly tag = createLabel(1.8);
  private greeted = false;
  private greetLeft = 0;

  constructor(body: THREE.Object3D, clips: THREE.AnimationClip[], look: NpcLook, label: string, x: number, z: number, yaw: number) {
    body.scale.setScalar(look.height / skinnedHeight(body));
    for (const material of ownMaterials(body)) {
      const colour = look.colors[material.name];
      if (colour !== undefined) material.color.setHex(colour);
    }
    this.mixer = new THREE.AnimationMixer(body);
    this.idle = this.mixer.clipAction(clipByName(clips, look.idle));
    this.greet = this.mixer.clipAction(clipByName(clips, look.greet));
    this.greet.setLoop(THREE.LoopOnce, 1);
    this.blender = new ActionBlender(this.idle);
    setLabel(this.tag, label, "#ffd36a");
    this.tag.position.y = look.height + 0.35;
    this.object.add(body, this.tag);
    this.object.position.set(x, 0, z);
    // The model faces +z; yaw uses the camera convention.
    body.rotation.y = yaw + Math.PI;
    this.object.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  // `you` is your distance from them, `camera` the camera's (for the name's fade).
  sync(dt: number, you: number, camera: number): void {
    if (!this.greeted && you < GREET_NEAR) {
      this.greeted = true;
      this.greetLeft = this.greet.getClip().duration;
      this.greet.reset();
      this.blender.fadeTo(this.greet, 0.15);
    } else if (this.greeted && you > GREET_RESET) {
      this.greeted = false;
    }
    if (this.greetLeft > 0) {
      this.greetLeft -= dt;
      if (this.greetLeft <= 0) this.blender.fadeTo(this.idle, 0.25);
    }
    const shown = camera < LABEL_FAR;
    this.tag.visible = shown;
    if (shown) this.tag.material.opacity = camera <= LABEL_NEAR ? 1 : 1 - (camera - LABEL_NEAR) / (LABEL_FAR - LABEL_NEAR);
    this.mixer.update(dt);
  }
}
