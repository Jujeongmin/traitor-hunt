import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildStaticBatch } from "../../src/game/render/staticBatch";

function model(): { scene: THREE.Object3D } {
  const scene = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  a.position.set(0, 2, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  scene.add(a, b);
  return { scene };
}

describe("buildStaticBatch", () => {
  it("makes one instanced mesh per model part and keeps each part's offset", () => {
    const lib = model();
    const pieces = [0, 10, 20].map((x) => ({ model: "box", matrix: new THREE.Matrix4().makeTranslation(x, 0, 0) }));
    const group = buildStaticBatch({ get: () => lib }, pieces);
    expect(group.children).toHaveLength(2);
    const first = group.children[0] as THREE.InstancedMesh;
    expect(first.count).toBe(3);
    const m = new THREE.Matrix4();
    first.getMatrixAt(1, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([10, 2, 0]);
  });
});
