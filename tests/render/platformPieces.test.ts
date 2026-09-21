import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { platformMatrix } from "../../src/game/render/levelScene";
import { LOW_H, type Platform } from "../../src/game/rules/platforms";

const crate: Platform = { x: 6, z: 8, w: 1.4, d: 1.2, h: LOW_H, model: "pt_logs" };
// A model one unit wide, sitting on its own origin.
const unit = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));

describe("platformMatrix", () => {
  it("stretches the model to the box you can stand on, resting on the floor", () => {
    const box = new THREE.Box3()
      .setFromObject(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)))
      .applyMatrix4(platformMatrix(crate, unit));
    expect(box.min.toArray().map((v) => +v.toFixed(3))).toEqual([6 - 0.7, 0, 8 - 0.6]);
    expect(box.max.toArray().map((v) => +v.toFixed(3))).toEqual([6 + 0.7, LOW_H, 8 + 0.6]);
  });

  it("lifts a model whose pivot is not at its foot", () => {
    const sunk = new THREE.Box3(new THREE.Vector3(-0.5, -0.25, -0.5), new THREE.Vector3(0.5, 0.75, 0.5));
    const y = new THREE.Vector3().setFromMatrixPosition(platformMatrix(crate, sunk)).y;
    expect(y).toBeCloseTo(LOW_H * 0.25);
  });
});
