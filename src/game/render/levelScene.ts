import * as THREE from "three";
import type { ModelLibrary } from "../assets/ModelLibrary";
import { DRESSING_MODELS, dressLevel } from "../rules/dressing";
import { TILE_SIZE, solidAt, type LevelLayout } from "../rules/levelLayout";
import type { Platform } from "../rules/platforms";
import type { LightPool } from "./lightPool";
import { bakedTint, buildStaticBatch, type BakeLight, type StaticPiece } from "./staticBatch";

// Corrections for the Decrepit Dungeon kit's own pivots and facing, tuned by eye in Plan 1.
// Wall_A is authored running along z, so it needs a quarter turn to span its edge.
export const KIT = { wallYawOffset: Math.PI / 2, wallInset: 0, ceilingYOffset: 0 };

const KIT_MODELS = [
  "dd_floor_a", "dd_ceiling", "dd_wall_a", "dd_pillar_a", "dd_torch", "dd_barrel", "chest_closed",
  "dd_floor_gate", "dd_crate_a",
];
export const LEVEL_MODELS = [...new Set([...KIT_MODELS, ...DRESSING_MODELS])];

const HANG_CLEARANCE = 2.3;
const TORCH_COLOR = new THREE.Color(0xff8a3d);
// Baked torch light is a softer, paler warmth than the flame itself, so near walls do not burn orange.
const TORCH_BAKE = { color: new THREE.Color(1, 0.82, 0.62), strength: 0.7, range: 11 };
const BAKE_AMBIENT = 0.5;
const BAKE_MAX = 1.25;

// Where to draw a platform's model so the crate you see is the box you stand on: stretched to its
// width, depth and top, and lifted until its own foot rests on the floor.
export function platformMatrix(platform: Platform, bounds: THREE.Box3): THREE.Matrix4 {
  const size = bounds.getSize(new THREE.Vector3());
  const scale = new THREE.Vector3(platform.w / size.x, platform.h / size.y, platform.d / size.z);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(platform.x, -bounds.min.y * scale.y, platform.z),
    new THREE.Quaternion(),
    scale,
  );
}

export interface LevelScene {
  kitScale: number;
}

// Builds the dressed kit level (instanced, with baked torch light), its ambient light, the torch flames
// as pooled light sources and the exit hatch. Shared by the match view and the main menu.
export function buildLevelScene(
  scene: THREE.Scene, library: ModelLibrary, layout: LevelLayout, lights: LightPool, time: () => number,
): LevelScene {
  const dressing = dressLevel(layout);
  const floorSize = new THREE.Box3().setFromObject(library.get("dd_floor_a").scene).getSize(new THREE.Vector3());
  const kitScale = TILE_SIZE / Math.max(floorSize.x, floorSize.z);

  // Flame positions: pillar torches and wall torches, nudged off the wall into the room.
  const torches = dressing
    .filter((p) => p.model === "dd_torch")
    .map((p) => ({ x: p.x + Math.sin(p.rotationY) * 0.3, y: p.y + 0.4, z: p.z + Math.cos(p.rotationY) * 0.3 }));

  scene.add(new THREE.HemisphereLight(0x8a8298, 0x2a2018, 0.9));
  torches.forEach((at, i) => {
    lights.add({
      position: new THREE.Vector3(at.x, at.y, at.z),
      color: TORCH_COLOR,
      range: 12,
      intensity: () => {
        const t = time();
        return 25 + Math.sin(t * 9 + i * 1.7) * 3 + Math.sin(t * 23 + i) * 2;
      },
    });
  });

  const bake: BakeLight[] = torches.map((at) => ({ ...at, ...TORCH_BAKE }));
  const blocked = (x: number, z: number) => solidAt(layout, x, z);
  const heights = new Map<string, { min: number; max: number }>();
  const heightOf = (model: string) => {
    let h = heights.get(model);
    if (!h) {
      const box = new THREE.Box3().setFromObject(library.get(model).scene);
      h = { min: box.min.y * kitScale, max: box.max.y * kitScale };
      heights.set(model, h);
    }
    return h;
  };
  const sample = new THREE.Vector3();
  const pieces: StaticPiece[] = dressing.map((p) => {
    let { x, y, z } = p;
    let yaw = p.rotationY;
    // Where the piece's light is judged: a little in front of wall faces, mid-height otherwise.
    sample.set(x, 1.5, z);
    if (p.model.startsWith("dd_wall_")) {
      sample.set(x + Math.sin(yaw) * 0.4, 2, z + Math.cos(yaw) * 0.4);
      x += Math.sin(p.rotationY) * KIT.wallInset;
      z += Math.cos(p.rotationY) * KIT.wallInset;
      yaw += KIT.wallYawOffset;
    }
    if (p.model.startsWith("dd_floor_")) sample.y = 0.3;
    if (p.model === "dd_ceiling") {
      y += KIT.ceilingYOffset;
      sample.y = TILE_SIZE - 0.3;
    }
    if (p.hang) {
      // Top against the ceiling, but never lower than head height so players pass beneath.
      const h = heightOf(p.model);
      y += Math.max(TILE_SIZE - (y + h.max), HANG_CLEARANCE - (y + h.min));
    }
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(kitScale, kitScale, kitScale),
    );
    const tint = p.model === "dd_torch" ? new THREE.Color(1, 1, 1) : bakedTint(sample, bake, BAKE_AMBIENT, blocked);
    tint.setRGB(Math.min(tint.r, BAKE_MAX), Math.min(tint.g, BAKE_MAX), Math.min(tint.b, BAKE_MAX));
    return { model: p.model, matrix, tint };
  });
  // Crates to jump onto. The barrel and the chest are already placed as props; only the crates are
  // stretched to their boxes.
  const crateBounds = new Map<string, THREE.Box3>();
  for (const platform of layout.platforms) {
    if (platform.model !== "dd_crate_a") continue;
    let bounds = crateBounds.get(platform.model);
    if (!bounds) {
      bounds = new THREE.Box3().setFromObject(library.get(platform.model).scene);
      crateBounds.set(platform.model, bounds);
    }
    const matrix = platformMatrix(platform, bounds);
    const tint = bakedTint(sample.set(platform.x, platform.h, platform.z), bake, BAKE_AMBIENT, blocked);
    tint.setRGB(Math.min(tint.r, BAKE_MAX), Math.min(tint.g, BAKE_MAX), Math.min(tint.b, BAKE_MAX));
    pieces.push({ model: platform.model, matrix, tint });
  }
  scene.add(buildStaticBatch(library, pieces).group);

  // The way out is a floor hatch with a pale green glow.
  for (const exit of layout.exits) {
    const hatch = library.instance("dd_floor_gate");
    hatch.scale.setScalar(kitScale * 0.8);
    hatch.updateMatrixWorld(true);
    const centre = new THREE.Box3().setFromObject(hatch).getCenter(new THREE.Vector3());
    hatch.position.set(exit.x - centre.x, 0.02, exit.z - centre.z);
    scene.add(hatch);
    lights.add({ position: new THREE.Vector3(exit.x, 1.2, exit.z), color: new THREE.Color(0x4dff9a), range: 8, intensity: () => 12 });
  }
  return { kitScale };
}
