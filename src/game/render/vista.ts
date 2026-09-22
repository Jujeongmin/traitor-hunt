import * as THREE from "three";
import type { LevelLayout } from "../rules/levelLayout";
import { cellNoise, forestFillers } from "../rules/nature";
import { buildSpriteForest, buildWorldTreeSprite, type TreeSprites } from "./treeSprites";
import type { ModelSource } from "./staticBatch";
import { groundMaterial } from "./groundTextures";

// The land beyond the playable map, so a zone sits in wide country instead of a walled box: forest
// floor running out flat under a dark forest for hundreds of metres, until it fades into the haze.

// The land ends this far from the map's middle.
const LAND_RADIUS = 1400;
// Far trees: how many, and the band of distance beyond the map edge they grow in.
const FAR_TREES = 2600;
const TREES_FROM = 22;
const TREES_TO = 420;

// Smooth noise in [0, 1): stable values on a grid, blended between.
export function smoothNoise(x: number, z: number, salt: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const at = (c: number, r: number) => cellNoise(c, r, salt);
  const top = at(x0, z0) * (1 - sx) + at(x0 + 1, z0) * sx;
  const bottom = at(x0, z0 + 1) * (1 - sx) + at(x0 + 1, z0 + 1) * sx;
  return top * (1 - sz) + bottom * sz;
}

// How far (x, z) lies outside the map's rectangle, in metres (0 inside).
function outside(layout: LevelLayout, x: number, z: number): number {
  const w = layout.cols * layout.tileSize;
  const d = layout.rows * layout.tileSize;
  const dx = Math.max(0 - x, 0, x - w);
  const dz = Math.max(0 - z, 0, z - d);
  return Math.hypot(dx, dz);
}

// The colour of the forest floor, as under the trees at the map's edge (levelScene).
const FOREST_FLOOR = new THREE.Color(0x4f6e32);

function buildLand(centre: THREE.Vector3): THREE.Mesh {
  const size = LAND_RADIUS * 2;
  const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  // Under the map the detailed ground (levelScene) covers this; kept just below it.
  geometry.translate(centre.x, -0.08, centre.z);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).map((_, i) => FOREST_FLOOR.toArray()[i % 3]), 3));
  // All forest floor (see groundTextures.ts).
  geometry.setAttribute("splat", new THREE.BufferAttribute(new Float32Array(count * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return new THREE.Mesh(geometry, groundMaterial());
}

// The forest running on beyond the map: thick near it, thinning out toward the far side, with
// clearings here and there.
function farTrees(layout: LevelLayout) {
  const w = layout.cols * layout.tileSize;
  const d = layout.rows * layout.tileSize;
  const out: { x: number; y: number; z: number; height: number; shade: number }[] = [];
  for (let i = 0; out.length < FAR_TREES && i < FAR_TREES * 4; i++) {
    const band = TREES_FROM + (TREES_TO - TREES_FROM) * cellNoise(i, 1, 400) ** 1.7;
    const angle = cellNoise(i, 2, 400) * Math.PI * 2;
    const x = w / 2 + Math.cos(angle) * (w / 2 + band);
    const z = d / 2 + Math.sin(angle) * (d / 2 + band);
    if (outside(layout, x, z) < TREES_FROM) continue;
    if (smoothNoise(x / 60, z / 60, 410) < 0.3) continue;
    out.push({ x, y: 0, z, height: 10 + cellNoise(i, 3, 400) * 12, shade: cellNoise(i, 5, 400) });
  }
  return out;
}

// The world tree: a landmark far to the north, towering over the forest, seen from every zone.
const WORLD_TREE = { distance: 760, bearing: -Math.PI * 0.42, height: 380 };

// A castle far out beyond the forest, where nobody can walk: the village tower model (see
// scripts/build-houses.mjs) at several times its size, a cluster of towers tall enough
// to rise well over the forest's edge.
export const CASTLE_MODELS = ["bld_tower"];
const CASTLE = { beyond: 380, bearing: Math.PI * 0.2 };
// Each tower: [metres across, metres toward the map, scale].
const CASTLE_TOWERS = [
  [0, 0, 7.4], [-72, 12, 5.6], [66, 18, 5.4], [-26, 52, 4.6], [34, 58, 4.3], [-116, 42, 4], [108, 46, 3.9],
] as const;

function buildCastle(layout: LevelLayout, library: ModelSource, centre: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const reach = Math.max(layout.cols, layout.rows) * layout.tileSize * 0.5 + CASTLE.beyond;
  const dx = Math.cos(CASTLE.bearing);
  const dz = Math.sin(CASTLE.bearing);
  const facing = Math.atan2(-dx, -dz);
  for (const [across, toward, scale] of CASTLE_TOWERS) {
    const x = centre.x + dx * (reach - toward) - dz * across;
    const z = centre.z + dz * (reach - toward) + dx * across;
    const tower = library.get("bld_tower").scene.clone(true);
    tower.scale.setScalar(scale);
    tower.position.set(x, 0, z);
    tower.rotation.y = facing;
    group.add(tower);
  }
  return group;
}

export function buildVista(layout: LevelLayout, sprites: TreeSprites, library: ModelSource): THREE.Group {
  const centre = new THREE.Vector3((layout.cols * layout.tileSize) / 2, 0, (layout.rows * layout.tileSize) / 2);
  const group = new THREE.Group();
  const fillers = forestFillers(layout).map((f) => ({ ...f, y: 0 }));
  group.add(buildLand(centre), buildSpriteForest(sprites, [...fillers, ...farTrees(layout)]));
  group.add(buildCastle(layout, library, centre));
  group.add(buildWorldTreeSprite(
    sprites,
    centre.x + Math.cos(WORLD_TREE.bearing) * WORLD_TREE.distance, -6,
    centre.z + Math.sin(WORLD_TREE.bearing) * WORLD_TREE.distance, WORLD_TREE.height,
  ));
  return group;
}
