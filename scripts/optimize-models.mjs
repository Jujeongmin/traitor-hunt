/**
 * art-src/_glb -> public/assets/models (+ manifest.json)
 *
 *   node scripts/optimize-models.mjs
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { buildManifest } from "./lib/manifest.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "art-src/_glb");
const outDir = join(root, "public/assets/models");

// Models too dense for four players on the web: keep this share of their triangles.
// error is how far (as a share of the model's size) the simplified surface may drift.
const SIMPLIFY = {
  // Stylized Nature: a field holds a few hundred trees and a few thousand plants.
  sn_tree_1: { ratio: 0.35, error: 0.02 }, sn_tree_2: { ratio: 0.4, error: 0.02 }, sn_tree_3: { ratio: 0.5, error: 0.02 },
  sn_tree_4: { ratio: 0.5, error: 0.02 }, sn_pine_1: { ratio: 0.5, error: 0.02 }, sn_pine_3: { ratio: 0.4, error: 0.02 },
  sn_flowers: { ratio: 0.4, error: 0.03 }, sn_clover: { ratio: 0.5, error: 0.03 }, sn_mushroom: { ratio: 0.3, error: 0.03 },
  sn_bush_flowers: { ratio: 0.5, error: 0.03 },
  // The tower's stone corner pieces are finely carved; from the ground a third of it does.
  bld_tower: { ratio: 0.3, error: 0.01 },
};
mkdirSync(outDir, { recursive: true });

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const entries = [];
for (const file of readdirSync(srcDir).filter((f) => f.endsWith(".glb"))) {
  const name = basename(file, ".glb");
  const doc = await io.read(join(srcDir, file));
  const skinned = doc.getRoot().listSkins().length > 0;
  // Polytope's nature pack stores its shader's wind and tint masks in vertex colours; three.js
  // would multiply the textures by them and draw trunks and leaves purple.
  if (name.startsWith("pt_")) {
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) prim.setAttribute("COLOR_0", null);
    }
  }

  const steps = [
    weld(),
    ...(SIMPLIFY[name] ? [simplify({ simplifier: MeshoptSimplifier, ...SIMPLIFY[name] })] : []),
    dedup(),
    resample(),
    prune({ keepLeaves: skinned }),
    // The village houses and the Stylized Nature pieces share big kit textures: cut down further.
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: name.startsWith("bld_") || name.startsWith("sn_") ? [512, 512] : [1024, 1024] }),
  ];
  // Static kit pieces stay unquantized so their raw geometry can be instanced later.
  if (skinned) steps.push(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  await doc.transform(...steps);
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const outFile = join(outDir, file);
  await io.write(outFile, doc);
  const animations = doc.getRoot().listAnimations().map((a) => a.getName());
  entries.push({ name, bytes: statSync(outFile).size, animations });
  console.log(`${name}: ${Math.round(statSync(join(srcDir, file)).size / 1024)} KB -> ${Math.round(statSync(outFile).size / 1024)} KB`);
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(buildManifest(entries), null, 2) + "\n");
console.log(`wrote ${entries.length} models`);
