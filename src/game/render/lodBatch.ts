import * as THREE from "three";
import type { ModelSource, StaticPiece } from "./staticBatch";
import { crossedCards, spriteMaterial, type TreeSprites } from "./treeSprites";

// Many copies of a few models that only need to be drawn in full near the camera: trees, which turn
// into their picture (see treeSprites.ts) further off, and ground cover, which is left out further
// off (the fog and the grass colour hide it). One instanced mesh per model part plus one for the
// pictures, refilled whenever the camera has moved a few metres.

// Within this distance a piece is its model; beyond it, its picture (or nothing).
export const LOD_NEAR = 38;
// Refill after the camera moves this far, or this long after the last refill anyway.
const REFILL_MOVE = 3;
const REFILL_MS = 1000;

interface Kind {
  pieces: StaticPiece[];
  where: THREE.Vector3[];
  // Each part of the model, with where it sits in the model.
  parts: { mesh: THREE.InstancedMesh; relative: THREE.Matrix4 }[];
  // The picture of each piece, as a crossed-cards matrix; null where far pieces are left out.
  far: { mesh: THREE.InstancedMesh; matrices: THREE.Matrix4[] } | null;
}

export class LodBatch {
  readonly object = new THREE.Group();
  private readonly kinds: Kind[] = [];
  private last: { x: number; z: number; at: number } | null = null;

  // `sprites`: the pictures of the models that have one; any other model is left out when far.
  constructor(library: ModelSource, pieces: StaticPiece[], sprites: TreeSprites) {
    const byModel = new Map<string, StaticPiece[]>();
    for (const p of pieces) {
      const list = byModel.get(p.model) ?? [];
      list.push(p);
      byModel.set(p.model, list);
    }
    const cards = crossedCards();
    const at = new THREE.Vector3();
    const size = new THREE.Vector3();
    for (const [model, list] of byModel) {
      const template = library.get(model).scene;
      template.updateMatrixWorld(true);
      const rootInverse = template.matrixWorld.clone().invert();
      const parts: Kind["parts"] = [];
      template.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
        const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
        instanced.name = `${model}:${mesh.name}`;
        instanced.count = 0;
        parts.push({ mesh: instanced, relative: rootInverse.clone().multiply(mesh.matrixWorld) });
        this.object.add(instanced);
      });
      const sprite = sprites.get(model);
      let far: Kind["far"] = null;
      if (sprite) {
        new THREE.Box3().setFromObject(template).getSize(size);
        const scale = new THREE.Vector3();
        const turn = new THREE.Quaternion();
        const matrices = list.map((p) => {
          p.matrix.decompose(at, turn, scale);
          const height = size.y * scale.y;
          const width = height * sprite.aspect;
          return new THREE.Matrix4().compose(at.clone(), turn, new THREE.Vector3(width, height, width));
        });
        const mesh = new THREE.InstancedMesh(cards, spriteMaterial(sprite), list.length);
        mesh.name = `${model}:picture`;
        mesh.count = 0;
        this.object.add(mesh);
        far = { mesh, matrices };
      }
      this.kinds.push({ pieces: list, where: list.map((p) => new THREE.Vector3().setFromMatrixPosition(p.matrix)), parts, far });
    }
  }

  // Sorts every piece into near (its model) and far (its picture, or nothing) round (x, z).
  update(x: number, z: number, force = false): void {
    const now = performance.now();
    const last = this.last;
    if (!force && last && Math.hypot(x - last.x, z - last.z) < REFILL_MOVE && now - last.at < REFILL_MS) return;
    this.last = { x, z, at: now };
    const m = new THREE.Matrix4();
    for (const kind of this.kinds) {
      let near = 0;
      let far = 0;
      kind.pieces.forEach((piece, i) => {
        const w = kind.where[i];
        if (Math.hypot(w.x - x, w.z - z) <= LOD_NEAR) {
          for (const part of kind.parts) part.mesh.setMatrixAt(near, m.multiplyMatrices(piece.matrix, part.relative));
          near++;
        } else if (kind.far) {
          kind.far.mesh.setMatrixAt(far++, kind.far.matrices[i]);
        }
      });
      for (const part of kind.parts) {
        part.mesh.count = near;
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.computeBoundingSphere();
      }
      if (kind.far) {
        kind.far.mesh.count = far;
        kind.far.mesh.instanceMatrix.needsUpdate = true;
        kind.far.mesh.computeBoundingSphere();
      }
    }
  }
}
