import * as THREE from "three";

export interface StaticPiece {
  model: string;
  matrix: THREE.Matrix4;
}

export interface ModelSource {
  get(name: string): { scene: THREE.Object3D };
}

// Pieces are drawn in square chunks this wide, so the camera skips the chunks behind it.
const CHUNK = 72;

// Draws every copy of a model with one instanced mesh per model part and chunk of ground: a few
// hundred draw calls for the whole forest instead of one per tree, and only the chunks in view drawn.
export function buildStaticBatch(library: ModelSource, pieces: StaticPiece[]): THREE.Group {
  const group = new THREE.Group();
  const byModel = new Map<string, StaticPiece[]>();
  const at = new THREE.Vector3();
  for (const piece of pieces) {
    at.setFromMatrixPosition(piece.matrix);
    const key = `${piece.model}|${Math.floor(at.x / CHUNK)},${Math.floor(at.z / CHUNK)}`;
    const list = byModel.get(key) ?? [];
    list.push(piece);
    byModel.set(key, list);
  }
  const part = new THREE.Matrix4();
  for (const [key, list] of byModel) {
    const model = key.slice(0, key.indexOf("|"));
    const template = library.get(model).scene;
    template.updateMatrixWorld(true);
    const rootInverse = template.matrixWorld.clone().invert();
    template.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
      const relative = rootInverse.clone().multiply(mesh.matrixWorld);
      const instanced = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
      instanced.name = `${key}:${mesh.name}`;
      list.forEach((piece, slot) => instanced.setMatrixAt(slot, part.multiplyMatrices(piece.matrix, relative)));
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
  }
  return group;
}
