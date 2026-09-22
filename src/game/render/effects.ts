import * as THREE from "three";

// Small, short-lived effects the heroes leave behind: a shot flying out of a bow or a staff, and a
// ring of light when a skill goes off. They only show what the server already decided.

export type ShotKind = "arrow" | "bolt";

const SHOT_SPEED = 28;
const RING_SECONDS = 0.45;

interface Live {
  object: THREE.Object3D;
  left: number;
  step: (dt: number, t: number) => void;
}

const arrowGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5).rotateX(Math.PI / 2);
const boltGeometry = new THREE.SphereGeometry(0.16, 10, 8);
const ringGeometry = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
const moteGeometry = new THREE.OctahedronGeometry(0.12);
const FLOAT_SECONDS = 0.9;
const BURST_SECONDS = 0.7;

export class Effects {
  private readonly live: Live[] = [];

  constructor(private readonly scene: THREE.Object3D) {}

  // A shot from (x, height, z) along yaw (yaw 0 flies toward -z), for reach metres.
  shoot(kind: ShotKind, from: THREE.Vector3, yaw: number, reach: number): void {
    const material = kind === "arrow"
      ? new THREE.MeshBasicMaterial({ color: 0x8a5a2b })
      : new THREE.MeshBasicMaterial({ color: 0xb58cff, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(kind === "arrow" ? arrowGeometry : boltGeometry, material);
    mesh.position.copy(from);
    mesh.rotation.y = yaw;
    const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.add(mesh, reach / SHOT_SPEED, (dt) => mesh.position.addScaledVector(dir, SHOT_SPEED * dt));
  }

  // A ring that spreads out to radius round (x, z) and fades.
  ring(at: THREE.Vector3, radius: number, color: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.position.set(at.x, 0.08, at.z);
    this.add(mesh, RING_SECONDS, (_dt, t) => {
      mesh.scale.setScalar(0.3 + t * radius);
      material.opacity = 0.8 * (1 - t);
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

  // A puff where a monster fell: a ring on the ground and a few motes rising.
  burst(at: THREE.Vector3, color: number): void {
    this.ring(at, 1.8, color);
    for (let i = 0; i < 8; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
      const mote = new THREE.Mesh(moteGeometry, material);
      const angle = (i / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle), 0.8 + Math.random() * 0.6, Math.sin(angle));
      mote.position.set(at.x, 0.4, at.z);
      this.add(mote, BURST_SECONDS, (dt, t) => {
        mote.position.addScaledVector(dir, dt * 2.4);
        dir.y -= dt * 2;
        mote.scale.setScalar(1 - t * 0.7);
        material.opacity = 0.9 * (1 - t);
      });
    }
  }

  update(dt: number): void {
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

function disposeMaterial(object: THREE.Object3D): void {
  const material = (object as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
  if (material && !Array.isArray(material)) {
    material.map?.dispose();
    material.dispose();
  }
}
