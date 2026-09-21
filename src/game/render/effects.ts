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
  const material = (object as THREE.Mesh).material;
  if (material && !Array.isArray(material)) material.dispose();
}
