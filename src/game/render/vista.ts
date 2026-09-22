import * as THREE from "three";
import type { LevelLayout } from "../rules/levelLayout";
import { cellNoise, forestFillers } from "../rules/nature";
import { buildSpriteForest, buildWorldTreeSprite, type TreeSprites } from "./treeSprites";
import type { ModelSource } from "./staticBatch";

// The land beyond the playable map, so a zone sits in wide country instead of a walled box: rolling
// hills that rise away from the forest edge and a dark forest running over them for hundreds of
// metres, until it fades into the haze. The land is made here from numbers (no files), is the same
// for everyone, and costs a few draw calls.

// Beyond the map's own ground (see levelScene) the hills start this far out, and the land ends here.
const HILLS_FROM = 20;
const LAND_RADIUS = 1400;
const LAND_STEP = 20;
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

function layered(x: number, z: number, salt: number): number {
  return smoothNoise(x / 90, z / 90, salt) * 0.6 + smoothNoise(x / 35, z / 35, salt + 1) * 0.3 + smoothNoise(x / 12, z / 12, salt + 2) * 0.1;
}

// How far (x, z) lies outside the map's rectangle, in metres (0 inside).
function outside(layout: LevelLayout, x: number, z: number): number {
  const w = layout.cols * layout.tileSize;
  const d = layout.rows * layout.tileSize;
  const dx = Math.max(0 - x, 0, x - w);
  const dz = Math.max(0 - z, 0, z - d);
  return Math.hypot(dx, dz);
}

// The height of the land at (x, z): flat under the map and its forest ring, then rising into hills
// that roll higher the further out they are.
export function landHeight(layout: LevelLayout, x: number, z: number): number {
  const out = outside(layout, x, z) - HILLS_FROM;
  if (out <= 0) return 0;
  const rise = Math.min(1, out / 120);
  const eased = rise * rise * (3 - 2 * rise);
  return eased * (6 + layered(x, z, 300) * 34) + out * 0.02;
}

const GRASS = new THREE.Color(0x6f9a45);
const DEEP_GRASS = new THREE.Color(0x45693a);
const HIGH_GRASS = new THREE.Color(0x8aa55c);

function buildLand(layout: LevelLayout, centre: THREE.Vector3): THREE.Mesh {
  const size = LAND_RADIUS * 2;
  const segments = Math.round(size / LAND_STEP);
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(centre.x, 0, centre.z);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const out = outside(layout, x, z);
    // Under the map the detailed ground (levelScene) covers this; kept just below it.
    const y = out < HILLS_FROM ? -0.08 : landHeight(layout, x, z);
    positions.setY(i, y);
    colour.copy(DEEP_GRASS).lerp(GRASS, layered(x, z, 310)).lerp(HIGH_GRASS, Math.min(1, y / 40));
    colors.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// The forest running on over the hills: thick near the map, thinning out toward the far side, with
// open hillsides here and there.
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
    out.push({ x, y: landHeight(layout, x, z), z, height: 10 + cellNoise(i, 3, 400) * 12, shade: cellNoise(i, 5, 400) });
  }
  return out;
}

// The world tree: a landmark far to the north, towering over the forest, seen from every zone.
const WORLD_TREE = { distance: 760, bearing: -Math.PI * 0.42, height: 380 };

// A castle far out beyond the forest, where nobody can walk: the village tower model (see
// scripts/build-houses.mjs) at several times its size, a cluster of towers on the hills tall enough
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
    // Sunk a little, so it rises out of the hillside rather than standing on a point of it.
    tower.position.set(x, landHeight(layout, x, z) - 3, z);
    tower.rotation.y = facing;
    group.add(tower);
  }
  return group;
}

export function buildVista(layout: LevelLayout, sprites: TreeSprites, library: ModelSource): THREE.Group {
  const centre = new THREE.Vector3((layout.cols * layout.tileSize) / 2, 0, (layout.rows * layout.tileSize) / 2);
  const group = new THREE.Group();
  const fillers = forestFillers(layout).map((f) => ({ ...f, y: landHeight(layout, f.x, f.z) }));
  group.add(buildLand(layout, centre), buildSpriteForest(sprites, [...fillers, ...farTrees(layout)]));
  group.add(buildCastle(layout, library, centre));
  group.add(buildWorldTreeSprite(
    sprites,
    centre.x + Math.cos(WORLD_TREE.bearing) * WORLD_TREE.distance, -6,
    centre.z + Math.sin(WORLD_TREE.bearing) * WORLD_TREE.distance, WORLD_TREE.height,
  ));
  return group;
}
