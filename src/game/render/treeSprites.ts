import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ModelSource } from "./staticBatch";

// The forest too deep or too far to draw tree by tree (thousands of trees): each is two crossed
// cards showing a picture of a real tree model (Stylized Nature, Quaternius), taken once when the
// level is built. From a few metres off it reads as the tree itself.

// The models the pictures are taken of: broad-leaved trees mostly, a pine now and then.
export const SPRITE_TREES = ["sn_tree_1", "sn_tree_2", "sn_tree_3", "sn_tree_4", "sn_pine_1"];
// The world tree on the horizon is a picture too.
const WORLD_TREE_MODEL = "sn_tree_2";
export const SPRITE_MODELS = [...new Set([...SPRITE_TREES, WORLD_TREE_MODEL])];

// Pixels across a picture; its height follows the tree's shape.
const PICTURE_WIDTH = 256;
// Leaves are cut out, not blended: below this alpha a pixel is not drawn.
const ALPHA_TEST = 0.4;
// The pictures are lit brightly and evenly; this tones them to sit among the lit models.
const TONE = 0.82;

export interface TreeSprite {
  texture: THREE.Texture;
  // Width over height of the picture.
  aspect: number;
}

export type TreeSprites = Map<string, TreeSprite>;

// Takes the side-on picture of one model: lit from the front and above, transparent round it.
function picture(renderer: THREE.WebGLRenderer, template: THREE.Object3D): TreeSprite {
  const tree = template.clone(true);
  const box = new THREE.Box3().setFromObject(tree);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  // Wide enough for the crown whichever way it spreads; the trunk's foot at the bottom edge.
  const half = Math.max(size.x, size.z) / 2;
  const aspect = (half * 2) / size.y;
  const camera = new THREE.OrthographicCamera(-half, half, size.y / 2, -size.y / 2, 0.1, 1000);
  camera.position.set(centre.x, centre.y, centre.z + 200);
  camera.lookAt(centre);
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(centre.x + 30, centre.y + 60, centre.z + 80);
  sun.target.position.copy(centre);
  scene.add(tree, new THREE.HemisphereLight(0xe6f2ff, 0x4a5a2c, 1.3), sun, sun.target);

  const target = new THREE.WebGLRenderTarget(PICTURE_WIDTH, Math.round(PICTURE_WIDTH / aspect), {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousClear, previousAlpha);
  return { texture: target.texture, aspect };
}

export function bakeTreeSprites(renderer: THREE.WebGLRenderer, library: ModelSource): TreeSprites {
  const sprites: TreeSprites = new Map();
  for (const model of SPRITE_MODELS) sprites.set(model, picture(renderer, library.get(model).scene));
  return sprites;
}

// Two unit cards crossed at right angles, standing on the origin.
function crossedCards(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return mergeGeometries([a, b]);
}

function spriteMaterial(sprite: TreeSprite): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: sprite.texture, alphaTest: ALPHA_TEST, side: THREE.DoubleSide, color: new THREE.Color(TONE, TONE, TONE),
  });
}

export interface SpriteTree {
  x: number;
  y: number;
  z: number;
  height: number;
  // 0 to 1: picks the kind of tree and its tint.
  shade: number;
}

// Every tree in the list as crossed cards, one instanced mesh per kind of tree.
export function buildSpriteForest(sprites: TreeSprites, trees: readonly SpriteTree[]): THREE.Group {
  const group = new THREE.Group();
  const geometry = crossedCards();
  const byKind = new Map<string, SpriteTree[]>();
  for (const t of trees) {
    const kind = SPRITE_TREES[Math.min(SPRITE_TREES.length - 1, Math.floor(t.shade * SPRITE_TREES.length))];
    const list = byKind.get(kind) ?? [];
    list.push(t);
    byKind.set(kind, list);
  }
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const [kind, list] of byKind) {
    const sprite = sprites.get(kind)!;
    const mesh = new THREE.InstancedMesh(geometry, spriteMaterial(sprite), list.length);
    list.forEach((t, i) => {
      const width = t.height * sprite.aspect;
      // Turned so neighbouring trees do not all show the same face.
      turn.setFromAxisAngle(up, t.shade * 37 * Math.PI);
      matrix.compose(new THREE.Vector3(t.x, t.y, t.z), turn, new THREE.Vector3(width, t.height, width));
      mesh.setMatrixAt(i, matrix);
      // A little lighter or darker, so the forest is not one flat green.
      const v = 0.85 + ((t.shade * 7.31) % 1) * 0.3;
      mesh.setColorAt(i, tint.setRGB(v, v, v));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

// The world tree: one tree picture as tall as a mountain, standing at (x, y, z).
export function buildWorldTreeSprite(sprites: TreeSprites, x: number, y: number, z: number, height: number): THREE.Mesh {
  const sprite = sprites.get(WORLD_TREE_MODEL)!;
  const mesh = new THREE.Mesh(crossedCards(), spriteMaterial(sprite));
  mesh.scale.set(height * sprite.aspect, height, height * sprite.aspect);
  mesh.position.set(x, y, z);
  return mesh;
}
