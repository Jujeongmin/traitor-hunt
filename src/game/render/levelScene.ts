import * as THREE from "three";
import type { ModelLibrary } from "../assets/ModelLibrary";
import type { LevelLayout, Point2 } from "../rules/levelLayout";
import { PATH_HALF_WIDTH, groundPaths, pathDistance } from "../rules/paths";
import { NATURE_MODELS, cellNoise, natureLayout } from "../rules/nature";
import type { Platform } from "../rules/platforms";
import { buildStaticBatch, type StaticPiece } from "./staticBatch";
import { HORIZON, skyTexture } from "./sky";
import { buildVista, smoothNoise } from "./vista";
import { SPRITE_MODELS, bakeTreeSprites } from "./treeSprites";

// The outdoor level: open grass paths between walls of forest, under a clear sky. The grid is the
// same as ever; solid cells are drawn as trees and rocks instead of stone walls.
const PLATFORM_MODELS = ["pt_logs", "pt_rock", "pt_tree_stump", "chest_closed"];
export const LEVEL_MODELS = [...new Set([...NATURE_MODELS, ...PLATFORM_MODELS, ...SPRITE_MODELS])];

export const SKY = HORIZON;
// Where the sunlight comes from, relative to the middle of the map.
const SUN_OFFSET = new THREE.Vector3(-35, 60, 25);
// Clear for the length of a field, then the far forest and the mountains fade into the haze.
const FOG_NEAR = 90;
const FOG_FAR = 1100;
// How far a camera over this scene should see.
export const VIEW_FAR = 1500;
// Open ground is sunlit grass in patches of lighter, deeper and dried grass; the forest floor under
// the trees is darker; the paths are dirt, fraying into the grass over PATH_FRAY metres.
const PATH_COLOR = new THREE.Color(0x8fb35a);
const DEEP_GRASS = new THREE.Color(0x6a9444);
const DRY_GRASS = new THREE.Color(0xb0ac5e);
const FOREST_COLOR = new THREE.Color(0x4f6e32);
const DIRT_COLOR = new THREE.Color(0x9a7d52);
const PATH_FRAY = 0.9;
// Beyond the map the ground runs on this many cells so the forest never floats over the void.
const GROUND_BORDER = 6;
const GROUND_STEP = 1;

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

// A ground plane coloured per vertex: meadow where you can walk, in broad patches of lighter, deeper
// and sun-dried grass; darker under the trees; worn to dirt along the paths. A little noise on top,
// so it does not look painted on.
function buildGround(layout: LevelLayout, paths: readonly Point2[][]): THREE.Mesh {
  const t = layout.tileSize;
  const width = (layout.cols + GROUND_BORDER * 2) * t;
  const depth = (layout.rows + GROUND_BORDER * 2) * t;
  const geometry = new THREE.PlaneGeometry(width, depth, Math.round(width / GROUND_STEP), Math.round(depth / GROUND_STEP));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((layout.cols * t) / 2, 0, (layout.rows * t) / 2);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  const meadow = new THREE.Color();
  const openAt = (x: number, z: number) => {
    const c = Math.floor(x / t);
    const r = Math.floor(z / t);
    return c >= 0 && r >= 0 && c < layout.cols && r < layout.rows && !layout.forest[r][c];
  };
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Broad patches, then smaller ones within them.
    const patch = smoothNoise(x / 22, z / 22, 700) * 0.7 + smoothNoise(x / 7, z / 7, 701) * 0.3;
    const dry = smoothNoise(x / 30, z / 30, 702);
    meadow.copy(DEEP_GRASS).lerp(PATH_COLOR, Math.min(1, patch * 1.4));
    if (dry > 0.6) meadow.lerp(DRY_GRASS, Math.min(1, (dry - 0.6) * 3));
    // Averaging the four nearby points softens the forest's edge.
    const open = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]].filter(([dx, dz]) => openAt(x + dx, z + dz)).length / 4;
    colour.copy(FOREST_COLOR).lerp(meadow, open);
    // The path: bare dirt in the middle, fraying into the grass at its edges.
    const fromPath = pathDistance(paths, x, z) + (smoothNoise(x / 2, z / 2, 703) - 0.5) * 0.8;
    if (fromPath < PATH_HALF_WIDTH + PATH_FRAY) {
      colour.lerp(DIRT_COLOR, Math.min(1, (PATH_HALF_WIDTH + PATH_FRAY - fromPath) / PATH_FRAY));
    }
    const jitter = 0.9 + cellNoise(Math.round(x * 2), Math.round(z * 2), 5) * 0.2;
    colors.set([colour.r * jitter, colour.g * jitter, colour.b * jitter], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  return ground;
}

// Builds the sky, the sun, the ground, the forest and the platforms. Shared by the world view and
// the menus.
// `destinations`: places besides the portals the dirt paths lead to (the village's doors).
export function buildLevelScene(
  scene: THREE.Scene, library: ModelLibrary, layout: LevelLayout, renderer: THREE.WebGLRenderer, destinations: readonly Point2[] = [],
): void {
  scene.background = skyTexture(SUN_OFFSET) ?? new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);
  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x5b6b34, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  const centre = new THREE.Vector3((layout.cols * layout.tileSize) / 2, 0, (layout.rows * layout.tileSize) / 2);
  sun.position.copy(centre).add(SUN_OFFSET);
  sun.target.position.copy(centre);
  scene.add(sun, sun.target);
  const paths = groundPaths(layout, destinations);
  scene.add(buildGround(layout, paths), buildVista(layout, bakeTreeSprites(renderer, library)));

  const pieces: StaticPiece[] = natureLayout(layout, paths).map((p) => ({
    model: p.model,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, 0, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw),
      new THREE.Vector3(p.scale, p.scale, p.scale),
    ),
  }));

  const bounds = new Map<string, THREE.Box3>();
  const boundsOf = (model: string) => {
    let b = bounds.get(model);
    if (!b) {
      b = new THREE.Box3().setFromObject(library.get(model).scene);
      bounds.set(model, b);
    }
    return b;
  };
  for (const platform of layout.platforms) {
    pieces.push({ model: platform.model, matrix: platformMatrix(platform, boundsOf(platform.model)) });
  }

  scene.add(buildStaticBatch(library, pieces));
}
