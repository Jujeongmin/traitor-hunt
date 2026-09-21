import * as THREE from "three";

export interface StaticPiece {
  model: string;
  matrix: THREE.Matrix4;
}

export interface ModelSource {
  get(name: string): { scene: THREE.Object3D };
}

// Draws every copy of a model with one instanced mesh per model part: a few dozen draw calls
// for the whole forest instead of one per tree.
export function buildStaticBatch(library: ModelSource, pieces: StaticPiece[]): THREE.Group {
  const group = new THREE.Group();
  const byModel = new Map<string, StaticPiece[]>();
  for (const piece of pieces) {
    const list = byModel.get(piece.model) ?? [];
    list.push(piece);
    byModel.set(piece.model, list);
  }
  const part = new THREE.Matrix4();
  for (const [model, list] of byModel) {
    const template = library.get(model).scene;
    template.updateMatrixWorld(true);
    const rootInverse = template.matrixWorld.clone().invert();
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      const relative = rootInverse.clone().multiply(mesh.matrixWorld);
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
      instanced.name = `${model}:${mesh.name}`;
      list.forEach((piece, slot) => instanced.setMatrixAt(slot, part.multiplyMatrices(piece.matrix, relative)));
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
  }
  return group;
}
