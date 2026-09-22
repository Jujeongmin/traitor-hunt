import * as THREE from "three";
import type { LevelLayout } from "../rules/levelLayout";
import { cellNoise, forestFillers } from "../rules/nature";

// The land beyond the playable map, so a zone sits in wide country instead of a walled box: rolling
// hills that rise away from the forest edge, a dark forest running over them for hundreds of metres,
// and two ranges of mountains on the horizon, the far one snow-capped. All of it is made here from
// numbers (no files), is the same for everyone, and costs a few draw calls.

// Beyond the map's own ground (see levelScene) the hills start this far out, and the land ends here.
const HILLS_FROM = 20;
const LAND_RADIUS = 1400;
const LAND_STEP = 14;
// Far trees: how many, and the band of distance beyond the map edge they grow in.
const FAR_TREES = 2600;
const TREES_FROM = 22;
const TREES_TO = 420;
// The mountain ranges: distance from the map's middle, and how tall their peaks grow.
const RANGES = [
  { radius: 520, low: 70, high: 170, seed: 3, snow: false },
  { radius: 900, low: 150, high: 330, seed: 9, snow: true },
];

// Smooth noise in [0, 1): stable values on a grid, blended between.
function smoothNoise(x: number, z: number, salt: number): number {
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

// Simple low-poly firs, as few draw calls as possible: two stacked cones for the crown on a short
// trunk, one instanced mesh each. Used for the forest behind the map's drawn edge and on the hills.
export function buildFirs(firs: readonly { x: number; y: number; z: number; height: number; shade: number }[]): THREE.Group {
  const lower = new THREE.ConeGeometry(1, 0.62, 7);
  lower.translate(0, 0.31 + 0.2, 0);
  const upper = new THREE.ConeGeometry(0.72, 0.5, 7);
  upper.translate(0, 0.5 + 0.25 + 0.2, 0);
  const trunk = new THREE.CylinderGeometry(0.1, 0.14, 0.3, 5);
  trunk.translate(0, 0.15, 0);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const meshes = [lower, upper].map((g) => new THREE.InstancedMesh(g, material, Math.max(1, firs.length)));
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x4a3524 }), Math.max(1, firs.length));
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  const shades = [0x2f5a2c, 0x35632f, 0x2a4f2e, 0x3d6b34, 0x264a2a];
  firs.forEach((f, i) => {
    const width = f.height * 0.3;
    matrix.compose(new THREE.Vector3(f.x, f.y, f.z), new THREE.Quaternion(), new THREE.Vector3(width, f.height, width));
    colour.setHex(shades[Math.floor(f.shade * shades.length) % shades.length]);
    for (const mesh of meshes) {
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, colour);
    }
    trunks.setMatrixAt(i, matrix);
  });
  for (const mesh of [...meshes, trunks]) mesh.count = firs.length;
  const group = new THREE.Group();
  group.add(...meshes, trunks);
  return group;
}

// The forest running on over the hills: thick near the map, thinning out toward the far side, with
// open hillsides here and there.
function farFirs(layout: LevelLayout) {
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

// A ring of mountains round the centre: a ridge of peaks whose slopes run from forest green through
// bare rock, with snow on the far range's tops.
function buildRange(centre: THREE.Vector3, range: (typeof RANGES)[number]): THREE.Mesh {
  const around = 180;
  // Rings of the ridge's cross-section: distance out from the range's line, and share of the peak.
  const profile = [[-160, 0], [-80, 0.45], [0, 1], [70, 0.6], [180, 0.1]] as const;
  const positions: number[] = [];
  const colors: number[] = [];
  const colour = new THREE.Color();
  const rock = new THREE.Color(0x7d8580);
  const foot = new THREE.Color(0x4f6b43);
  const snow = new THREE.Color(0xf4f7fa);
  const peakAt = (i: number) => {
    const a = i / around;
    const broad = smoothNoise(a * 9, range.seed, 500);
    const sharp = smoothNoise(a * 37, range.seed, 501);
    return range.low + (range.high - range.low) * (broad * 0.7 + sharp * 0.3);
  };
  for (let i = 0; i <= around; i++) {
    const angle = (i / around) * Math.PI * 2;
    const peak = peakAt(i % around);
    for (const [offset, share] of profile) {
      // Each ring wobbles a little so the slopes are not combed straight.
      const wobble = (cellNoise(i % around, offset + 200, 502 + range.seed) - 0.5) * 30;
      const radius = range.radius + offset + wobble;
      const y = peak * share * (0.85 + cellNoise(i % around, offset + 300, 503) * 0.3);
      positions.push(centre.x + Math.cos(angle) * radius, y - 4, centre.z + Math.sin(angle) * radius);
      const height = y / range.high;
      colour.copy(foot).lerp(rock, Math.min(1, height * 1.6));
      if (range.snow && height > 0.62) colour.lerp(snow, Math.min(1, (height - 0.62) * 4));
      colors.push(colour.r, colour.g, colour.b);
    }
  }
  const index: number[] = [];
  const rings = profile.length;
  for (let i = 0; i < around; i++) {
    for (let k = 0; k < rings - 1; k++) {
      const a = i * rings + k;
      const b = (i + 1) * rings + k;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

// The world tree: a landmark far to the north, taller than the mountains, seen from every zone.
const WORLD_TREE = { distance: 760, bearing: -Math.PI * 0.42, height: 380 };

function buildWorldTree(centre: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const { height } = WORLD_TREE;
  const bark = new THREE.MeshLambertMaterial({ color: 0x5b4331, flatShading: true });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.05, height * 0.11, height * 0.62, 9, 3), bark);
  trunk.position.y = height * 0.31;
  group.add(trunk);
  // Roots spreading at the foot, and a few great boughs.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + cellNoise(i, 0, 600);
    const root = new THREE.Mesh(new THREE.ConeGeometry(height * 0.035, height * 0.22, 6), bark);
    root.position.set(Math.cos(a) * height * 0.1, height * 0.03, Math.sin(a) * height * 0.1);
    root.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    group.add(root);
  }
  const leaves = [0x3f7a36, 0x4d8a3b, 0x356b31, 0x5a9a44];
  for (let i = 0; i < 16; i++) {
    const a = cellNoise(i, 1, 600) * Math.PI * 2;
    const out = cellNoise(i, 2, 600) * height * 0.32;
    const size = height * (0.12 + cellNoise(i, 3, 600) * 0.1);
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 1),
      new THREE.MeshLambertMaterial({ color: leaves[i % leaves.length], flatShading: true }),
    );
    blob.position.set(Math.cos(a) * out, height * (0.62 + cellNoise(i, 4, 600) * 0.3), Math.sin(a) * out);
    blob.scale.y = 0.7;
    group.add(blob);
  }
  group.position.set(
    centre.x + Math.cos(WORLD_TREE.bearing) * WORLD_TREE.distance, -6,
    centre.z + Math.sin(WORLD_TREE.bearing) * WORLD_TREE.distance,
  );
  return group;
}

export function buildVista(layout: LevelLayout): THREE.Group {
  const centre = new THREE.Vector3((layout.cols * layout.tileSize) / 2, 0, (layout.rows * layout.tileSize) / 2);
  const group = new THREE.Group();
  const fillers = forestFillers(layout).map((f) => ({ ...f, y: landHeight(layout, f.x, f.z) }));
  group.add(buildLand(layout, centre), buildFirs([...fillers, ...farFirs(layout)]));
  for (const range of RANGES) group.add(buildRange(centre, range));
  group.add(buildWorldTree(centre));
  return group;
}
