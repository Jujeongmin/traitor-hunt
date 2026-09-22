import * as THREE from "three";
import type { ModelSource } from "./staticBatch";
import { boltPicture, magicCircle } from "./magicCircle";

// Small, short-lived effects the heroes leave behind: an arrow (a model) or a spell (a picture) flying
// out of a bow or a staff, and a magic circle when a skill goes off. They only show what the server
// already decided.

export type ShotKind = "arrow" | "bolt";

const SHOT_SPEED = 28;
const RING_SECONDS = 0.45;

interface Live {
  object: THREE.Object3D;
  left: number;
  step: (dt: number, t: number) => void;
}

// The arrow model, and how long an arrow looks in flight (metres).
export const ARROW_MODEL = "fx_arrow";
const ARROW_LENGTH = 0.8;
const BOLT_SIZE = 1.3;
const BOLT_COLOR = 0xb58cff;
const FLOAT_SECONDS = 0.9;

export class Effects {
  private readonly live: Live[] = [];

  private arrow: THREE.Object3D | null = null;
  // The camera the spell pictures turn to face (see update).
  private camera: THREE.Camera | null = null;

  constructor(private readonly scene: THREE.Object3D) {}

  // The arrow model, once the models are in.
  useModels(library: ModelSource): void {
    const model = library.get(ARROW_MODEL).scene.clone(true);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(ARROW_LENGTH / size.z);
    // The model lies along z, point toward +z; turned to point along -z, the way yaw 0 faces.
    model.rotation.y = Math.PI;
    this.arrow = new THREE.Group().add(model);
  }

  // A shot from (x, height, z) along yaw (yaw 0 flies toward -z), for reach metres.
  shoot(kind: ShotKind, from: THREE.Vector3, yaw: number, reach: number): void {
    const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let object: THREE.Object3D;
    if (kind === "arrow") {
      if (!this.arrow) return;
      object = this.arrow.clone(true);
      object.rotation.y = yaw;
    } else {
      const material = new THREE.SpriteMaterial({
        map: boltPicture(), color: BOLT_COLOR, transparent: true, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(BOLT_SIZE);
      object = sprite;
    }
    object.position.copy(from);
    const sprite = object instanceof THREE.Sprite ? object : null;
    const ahead = new THREE.Vector3();
    const here = new THREE.Vector3();
    this.add(object, reach / SHOT_SPEED, (dt) => {
      object.position.addScaledVector(dir, SHOT_SPEED * dt);
      // The picture points along +x: turned on screen to point the way the spell flies.
      if (sprite && this.camera) {
        here.copy(object.position).project(this.camera);
        ahead.copy(object.position).add(dir).project(this.camera);
        (sprite.material as THREE.SpriteMaterial).rotation = Math.atan2(ahead.y - here.y, ahead.x - here.x);
      }
    });
  }

  // A magic circle that spreads out to radius round (x, z), turning, and fades.
  ring(at: THREE.Vector3, radius: number, color: number): void {
    const mesh = magicCircle(color, 1);
    mesh.position.set(at.x, 0.08, at.z);
    this.add(mesh, RING_SECONDS, (_dt, t) => {
      mesh.scale.setScalar(0.4 + t * radius);
      mesh.rotation.y = t * 1.2;
      mesh.material.opacity = 1 - t * t;
    });
  }

  // A number that rises from (x, y, z) and fades: damage dealt, damage taken. Big numbers (skills)
  // start larger and pop.
  floatText(at: THREE.Vector3, text: string, color: string, big = false): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = `800 ${big ? 46 : 38}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(20, 12, 8, 0.9)";
    ctx.strokeText(text, 64, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 20;
    const size = big ? 1.3 : 0.9;
    // A little sideways scatter, so hits in a row do not stack on each other.
    const drift = (Math.random() - 0.5) * 0.8;
    sprite.position.copy(at).add(new THREE.Vector3(drift, 0, drift * 0.5));
    const start = sprite.position.clone();
    this.add(sprite, FLOAT_SECONDS, (_dt, t) => {
      const pop = big ? 1 + Math.max(0, 0.6 - t * 3) : 1;
      sprite.scale.set(size * pop, size * 0.5 * pop, 1);
      sprite.position.set(start.x, start.y + t * 1.2, start.z);
      material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    });
  }

  update(dt: number, camera: THREE.Camera | null = null): void {
    this.camera = camera;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.left -= dt;
      if (e.left <= 0) {
        this.scene.remove(e.object);
        disposeMaterial(e.object);
        this.live.splice(i, 1);
        continue;
      }
      e.step(dt, 1 - e.left / (e.object.userData.total as number));
    }
  }

  dispose(): void {
    for (const e of this.live) {
      this.scene.remove(e.object);
      disposeMaterial(e.object);
    }
    this.live.length = 0;
  }

  private add(object: THREE.Object3D, seconds: number, step: Live["step"]): void {
    object.userData.total = seconds;
    this.scene.add(object);
    this.live.push({ object, left: seconds, step });
  }
}

// Its own material, and a number's own picture; the shared effect pictures and the arrow model stay.
function disposeMaterial(object: THREE.Object3D): void {
  const material = (object as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
  if (material && !Array.isArray(material)) {
    if (material.map instanceof THREE.CanvasTexture) material.map.dispose();
    material.dispose();
  }
}
