/**
 * Packs the glTF models listed in scripts/gltf-list.json (Quaternius, CC0) into art-src/_glb, where
 * `npm run models` picks them up with the Unity exports.
 *
 *   node scripts/import-gltf.mjs            (every model)
 *   node scripts/import-gltf.mjs hero_monk  (only the named models)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { items } = JSON.parse(readFileSync(join(root, "scripts/gltf-list.json"), "utf8"));
const only = process.argv.slice(2);
const list = only.length > 0 ? items.filter((i) => only.includes(i.name)) : items;
if (list.length === 0) throw new Error(`no models named ${only.join(", ")}`);
const outDir = join(root, "art-src/_glb");
mkdirSync(outDir, { recursive: true });

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const item of list) {
  const doc = await io.read(join(root, item.src));
  await io.write(join(outDir, `${item.name}.glb`), doc);
  const anims = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`${item.name}: ${anims.length} clips`);
}
