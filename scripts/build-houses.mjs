/**
 * Puts the village's houses together from the Medieval Village MegaKit's pieces (Quaternius, CC0;
 * art-src/medieval-village/glTF) and writes each as one model into art-src/_glb, where
 * `npm run models` picks them up.
 *
 *   node scripts/build-houses.mjs
 *
 * Kit units: a wall piece is 2 m wide and 3.12 m tall, centred on x, standing on y = 0, its outer
 * face towards +z. A house is W by D wall pieces round its centre, its door in the front (+z) wall.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, join as joinMeshes, mergeDocuments, prune, unpartition, weld } from "@gltf-transform/functions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kit = join(root, "art-src/medieval-village/glTF");
const outDir = join(root, "art-src/_glb");
mkdirSync(outDir, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const WALL = 2;
const STOREY = 3.12;

// Turns about y: the outer face of a wall piece (+z) then points this way.
const FACE = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

// What fills a wall piece's opening, by the wall piece: [piece, x along the wall, z out from it].
// Doors hang from their hinge, so they sit half a door to the left.
const FILLS = {
  Wall_UnevenBrick_Window_Wide_Round: [["Window_Wide_Round1", 0, 0]],
  Wall_Plaster_Window_Wide_Round: [["Window_Wide_Round1", 0, 0]],
  Wall_Plaster_Window_Thin_Round: [["Window_Thin_Round1", 0, 0]],
  Wall_UnevenBrick_Window_Thin_Round: [["Window_Thin_Round1", 0, 0]],
  Wall_UnevenBrick_Door_Round: [["Door_1_Round", -0.53, 0]],
  Wall_Plaster_Door_Round: [["Door_1_Round", -0.53, 0]],
};

// The pieces of one house: [piece, x, y, z, yaw]. `shutters` hangs open shutters on the upper
// storeys' wide windows.
function house({ w, d, storeys, door, roof, gable, chimney, shutters = false }) {
  const pieces = [];
  const hw = (w * WALL) / 2;
  const hd = (d * WALL) / 2;
  const put = (piece, x, y, z, yaw, level) => {
    pieces.push([piece, x, y, z, yaw]);
    const fills = [...(FILLS[piece] ?? [])];
    if (shutters && level > 0 && piece.includes("Window_Wide_Round")) fills.push(["WindowShutters_Wide_Round_Open", 0, 0]);
    for (const [fill, along, out] of fills) {
      // Offsets in the wall's own frame, turned with it.
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      pieces.push([fill, x + along * c + out * s, y, z - along * s + out * c, yaw]);
    }
  };
  storeys.forEach((st, level) => {
    const y = level * STOREY;
    const side = (count, at, face) => {
      for (let i = 0; i < count; i++) {
        const along = -((count - 1) * WALL) / 2 + i * WALL;
        const [x, z] =
          face === "front" ? [along, hd] : face === "back" ? [-along, -hd] : face === "right" ? [hw, -along] : [-hw, along];
        put(at(i, count), x, y, z, FACE[face], level);
      }
    };
    const middle = (i, count) => i === Math.floor(count / 2);
    side(w, (i, n) => (level === 0 && middle(i, n) ? door : i % 2 === 0 ? st.window : st.wall), "front");
    side(w, (i) => (i % 2 === 1 ? st.window : st.wall), "back");
    side(d, (i) => (i % 2 === 1 ? st.window : st.wall), "left");
    side(d, (i) => (i % 2 === 1 ? st.window : st.wall), "right");
    for (const [cx, cz] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) pieces.push([st.corner, cx, y, cz, 0]);
  });
  const top = storeys.length * STOREY;
  pieces.push([roof, 0, top, 0, 0]);
  if (gable) {
    pieces.push([gable, 0, top, hd, 0]);
    pieces.push([gable, 0, top, -hd, Math.PI]);
  }
  // Its foot hidden in the roof, its top well above the slope.
  if (chimney) pieces.push(["Prop_Chimney", chimney.x, top + 0.8, chimney.z, 0]);
  return pieces;
}

const STONE = { wall: "Wall_UnevenBrick_Straight", window: "Wall_UnevenBrick_Window_Wide_Round", corner: "Corner_Exterior_Wood" };
const PLASTER = { wall: "Wall_Plaster_Straight", window: "Wall_Plaster_Window_Wide_Round", corner: "Corner_Exterior_Wood" };
const TIMBER = { wall: "Wall_Plaster_WoodGrid", window: "Wall_Plaster_Window_Wide_Round", corner: "Corner_Exterior_Wood" };

// Each fits a 2 by 2 block of map cells (8 m square), door towards +z.
const HOUSES = {
  // Two storeys: stone below, plaster above, a tall tiled roof and a chimney.
  bld_house_tall: house({
    w: 3, d: 3, storeys: [STONE, PLASTER], door: "Wall_UnevenBrick_Door_Round",
    roof: "Roof_RoundTiles_6x6", gable: "Roof_Front_Brick6", chimney: { x: 1.6, z: -1.2 }, shutters: true,
  }),
  // Longer and lower: stone below, timber-framed above.
  bld_house_long: house({
    w: 3, d: 4, storeys: [STONE, TIMBER], door: "Wall_UnevenBrick_Door_Round",
    roof: "Roof_RoundTiles_6x8", gable: "Roof_Front_Brick6", chimney: { x: -1.6, z: 1.8 }, shutters: true,
  }),
  // A cottage: one plaster storey under a big roof.
  bld_house_small: house({
    w: 3, d: 3, storeys: [PLASTER], door: "Wall_Plaster_Door_Round",
    roof: "Roof_RoundTiles_6x6", gable: "Roof_Front_Brick6", chimney: { x: 1.6, z: 0.8 },
  }),
};

async function build(name, pieces) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(name);
  const house = doc.createNode(name);
  scene.addChild(house);
  const cache = new Map();
  for (const [piece, x, y, z, yaw] of pieces) {
    if (!cache.has(piece)) cache.set(piece, await io.read(join(kit, `${piece}.gltf`)));
    const source = cache.get(piece);
    const tops = source.getRoot().getDefaultScene()?.listChildren() ?? source.getRoot().listScenes()[0].listChildren();
    const map = mergeDocuments(doc, source);
    const holder = doc.createNode(piece).setTranslation([x, y, z]).setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
    for (const top of tops) holder.addChild(map.get(top));
    house.addChild(holder);
    for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  }
  await doc.transform(dedup(), flatten(), joinMeshes(), weld(), prune(), unpartition());
  await io.write(join(outDir, `${name}.glb`), doc);
  const tris = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(`${name}: ${pieces.length} pieces, ${doc.getRoot().listMeshes().length} meshes, ${Math.round(tris)} triangles`);
}

for (const [name, pieces] of Object.entries(HOUSES)) await build(name, pieces);
