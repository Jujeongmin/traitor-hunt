/**
 * Cuts the menu pieces (Dark UI Kit brush shapes) out of the Unity Asset Store UI pack into public/assets/ui (webp).
 * The results are store assets, so they are git-ignored like the models.
 *
 *   node scripts/extract-ui.mjs
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packs = join(process.env.UNITY_PROJECT ?? resolve(root, "../My project"), "Assets/Resources");
const outDir = join(root, "public/assets/ui");
mkdirSync(outDir, { recursive: true });

const GRUNGE = join(packs, "kΩsmaragd/Dark Buttons/dark-Buttons.png");

// [left, top, width, height] in the source image; each cut is trimmed to its visible pixels.
const CUTS = [
  { out: "grunge_band", src: GRUNGE, box: [1040, 30, 780, 280], width: 640 },
  { out: "grunge_frame", src: GRUNGE, box: [60, 580, 670, 380], width: 560 },
];

for (const cut of CUTS) {
  const [left, top, width, height] = cut.box;
  const piece = await sharp(cut.src).extract({ left, top, width, height }).png().toBuffer();
  await sharp(piece).trim().resize({ width: cut.width }).webp({ quality: 88 }).toFile(join(outDir, `${cut.out}.webp`));
  console.log(cut.out);
}
