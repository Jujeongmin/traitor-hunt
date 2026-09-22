import { ITEMS } from "../account/items";
import { publicUrl } from "../assets/publicUrl";

// Pixel-art icons for the skills and the menu buttons, drawn here as 12 x 12 grids and rendered to
// images once (no files to load). One letter per pixel; see PALETTE. Items have picture files (iconFor).

const PALETTE: Record<string, string> = {
  k: "#1a1412", w: "#fff6e6", s: "#b9c0c8", S: "#6b7078", t: "#f2cf9a",
  r: "#e6473a", R: "#8f2318", o: "#ff9a3c", y: "#ffe26a", Y: "#c9971a",
  g: "#6fd36a", G: "#2f8a3c", b: "#4f8fe6", B: "#244b8f", c: "#aeeaff",
  p: "#9b6cf0", P: "#4a2c8a", n: "#a8703c", N: "#5e3a1d", d: "#2b2540", K: "#3a3f46",
};

export const ICON_SIZE = 12;

const ICONS: Record<string, string[]> = {
  // Warrior: a sword swung round, a charging cut, the ground struck.
  warrior_0: [
    "...kkkkkk...",
    "..kyy..yyk..",
    ".ky......yk.",
    "ky...kk...yk",
    "k...kwsk...k",
    "k..kwsk....k",
    "k.kwsk.....k",
    "kknsk.....yk",
    ".kNk.....yk.",
    "..k.....yk..",
    "...kyyyyk...",
    "....kkkk....",
  ],
  warrior_1: [
    "........kkk.",
    ".......kwsk.",
    "......kwsk..",
    "kkk..kwsk...",
    "..k.kwsk....",
    "kk.kwsk.....",
    "..kwsk......",
    "kknsk.......",
    ".kNkk.......",
    "kkkyk.......",
    "....k.......",
    "............",
  ],
  warrior_2: [
    "....kkkk....",
    "...kSssSk...",
    "...kSssSk...",
    "...kkSSkk...",
    ".....kNk....",
    ".....knk....",
    ".....knk....",
    "..y..knk..y.",
    ".ky..knk..yk",
    "kyk.kkkkk.ky",
    "kkkkkoookkkk",
    ".kooookooook",
  ],
  // Ranger: a piercing arrow, an aimed shot, a rain of arrows.
  ranger_0: [
    "........kkkk",
    ".........kwk",
    "........kwwk",
    ".......kwswk",
    "......kwskkk",
    ".....kwsk...",
    "....kwsk....",
    "...kwsk.....",
    "..kwsk......",
    "krknk.......",
    "krrk........",
    "kkrk........",
  ],
  ranger_1: [
    "...kkkkkk...",
    "..krrkkrrk..",
    ".kr..kk..rk.",
    "kr...kk...rk",
    "k....kk....k",
    "kkkkkwwkkkkk",
    "kkkkkwwkkkkk",
    "k....kk....k",
    "kr...kk...rk",
    ".kr..kk..rk.",
    "..krrkkrrk..",
    "...kkkkkk...",
  ],
  ranger_2: [
    "k...k...k...",
    "kk..kk..kk..",
    ".s...s...s..",
    ".s...s...s..",
    ".s...s...s..",
    ".w...w...w..",
    ".w...w...w..",
    "knk.knk.knk.",
    "knk.knk.knk.",
    ".k...k...k..",
    "............",
    "............",
  ],
  // Wizard: a burst of fire, an ice spear, a falling meteor.
  wizard_0: [
    ".....kk.....",
    "....krrk....",
    "...krrork...",
    "...krooRk...",
    "..krooyork..",
    "..kroyyyrk..",
    ".krroyyyorrk",
    ".kroyywyork.",
    "kkroyyyyork.",
    ".krrooyorrk.",
    "..krrrrrrk..",
    "...kkkkkk...",
  ],
  wizard_1: [
    "..........kk",
    ".........kck",
    "........kcck",
    ".......kccwk",
    "......kccwk.",
    ".....kccwk..",
    "....kcbwk...",
    "...kcbwk....",
    "..kbBwk.....",
    ".kbBBk......",
    "kBBkk.......",
    "kkk.........",
  ],
  wizard_2: [
    "...........k",
    "..........ko",
    ".........koy",
    "........kooy",
    ".......koRo.",
    "kk....koRRo.",
    "kSk..koRRo..",
    "kSSkkoRRo...",
    "kSSSSRRo....",
    "kSSSSRRk....",
    ".kSSSSk.....",
    "..kkkk......",
  ],
  // Cleric: healing light, a holy strike, a blessing.
  cleric_0: [
    ".....kk.....",
    "....kggk....",
    "....kgwgk...",
    "..kkkgwgkkk.",
    ".kggggwggggk",
    ".kgwwwwwwwgk",
    ".kggggwggggk",
    "..kkkgwgkkk.",
    "....kgwgk...",
    "....kggk....",
    ".....kk.....",
    "............",
  ],
  cleric_1: [
    "........kkk.",
    ".......kyyk.",
    "......kywyk.",
    ".....kyyyk..",
    "....kynk....",
    "...kknk.....",
    "..kwnk......",
    ".kwnk.......",
    "kwnk........",
    "knk.........",
    "kk..........",
    "............",
  ],
  cleric_2: [
    ".....kk.....",
    "..k.kyyk.k..",
    ".ky.kywk.yk.",
    "..kkkyykkk..",
    "..kyyyyyyk..",
    "kkywwywwyykk",
    "kkyywyywyykk",
    "..kyyyyyyk..",
    "..kkkyykkk..",
    ".ky.kyyk.yk.",
    "..k.kyyk.k..",
    ".....kk.....",
  ],
  // Rogue: a shadow stab, a fan of blades, a shadow dance.
  rogue_0: [
    "..........k.",
    ".........kpk",
    "........kpsk",
    ".......kpsk.",
    "......kpsk..",
    ".....kpsk...",
    "....kpsk....",
    "...kpsk.....",
    "..kdsk......",
    ".kddk.......",
    "kddk........",
    "kkk.........",
  ],
  rogue_1: [
    "k....kk....k",
    "ks...ss...sk",
    ".ks..ss..sk.",
    "..ks.ss.sk..",
    "...kssssk...",
    "....kssk....",
    "....kddk....",
    "....kddk....",
    "...kddddk...",
    "...kdkkdk...",
    "...kk..kk...",
    "............",
  ],
  rogue_2: [
    "...kkkkkk...",
    "..kppppppk..",
    ".kpdddddppk.",
    "kpd..kk..dpk",
    "kpd.kppk.dpk",
    "kpd.kpsk.dpk",
    "kpd..kk..dpk",
    "kpdd....ddpk",
    ".kpddddddpk.",
    "..kppppppk..",
    "...kkkkkk...",
    "............",
  ],
  // Monk: a stunning flurry, a whirling kick, the white-hot fist.
  monk_0: [
    "y....k....y.",
    ".y..ktk..y..",
    "...kttttk...",
    "..kttttttk..",
    "..kttkkttk..",
    "..kttkkttk..",
    ".kttttttttk.",
    ".kttttttttk.",
    "..kttttttk..",
    "..kkkkkkkk..",
    ".y........y.",
    "y..........y",
  ],
  monk_1: [
    ".kkkkkkkkkk.",
    "kccwwccccwck",
    ".kkkkkkkkkk.",
    "..kccwcccck.",
    "...kkkkkkk..",
    "...kcwccck..",
    "....kkkkk...",
    "....kcwck...",
    ".....kkk....",
    ".....kck....",
    "....kntk....",
    "....kkkk....",
  ],
  monk_2: [
    ".....kk.....",
    "....kyyk....",
    "...kyoyyk...",
    "..kyottoyk..",
    "..koktttok..",
    ".kyotkkttyk.",
    ".kyotkktttk.",
    ".kyottttttk.",
    "..kottttok..",
    "..kyottoyk..",
    "...kyyyyk...",
    "....kkkk....",
  ],
  // The menu's buttons: a trophy, a book of skills, a bag, the shop's scales, a cog.
  ui_ranking: [
    "kkkkkkkkkkkk",
    "kyyyyyyyyyyk",
    "kkyyyyyyyykk",
    ".kyYyyyyYyk.",
    ".kkyyyyyykk.",
    "..kyyyyyyk..",
    "...kyyyyk...",
    "....kyyk....",
    "....kYYk....",
    "...kkYYkk...",
    "..kNNNNNNk..",
    "..kkkkkkkk..",
  ],
  ui_quests: [
    "..kkkkkkkk..",
    ".kwwwwwwwwk.",
    "kNkwwwwwwkNk",
    "kNkwkkkkwkNk",
    ".kkwwwwwwkk.",
    "..kwkkkkwk..",
    "..kwwwwwwk..",
    "..kwkkkwwk..",
    "..kwwwwwwk..",
    ".kkwwwwwwkk.",
    "kNkkkkkkkkNk",
    ".kk......kk.",
  ],
  ui_skills: [
    "kkkkkkkkkkk.",
    "kbbbbbbbbbkk",
    "kbwwwwwwwbwk",
    "kbwyywwwwbwk",
    "kbwwwwwwwbwk",
    "kbwyyywwwbwk",
    "kbwwwwwwwbwk",
    "kbwyywwwwbwk",
    "kbwwwwwwwbwk",
    "kbbbbbbbbbwk",
    "kkkkkkkkkkwk",
    ".kkkkkkkkkkk",
  ],
  ui_bag: [
    "....kkkk....",
    "...kNNNNk...",
    "..kN....Nk..",
    "kkkkkkkkkkkk",
    "knnnnnnnnnnk",
    "knnnnYYnnnnk",
    "knnnkYYknnnk",
    "knnnnkknnnnk",
    "kNnnnnnnnnNk",
    "kNNnnnnnnNNk",
    "kNNNNNNNNNNk",
    ".kkkkkkkkkk.",
  ],
  ui_shop: [
    ".....kk.....",
    "....kyyk....",
    "..kkkyykkk..",
    ".kyykkkkyyk.",
    "kyk.kyyk.kyk",
    "kyk.kyyk.kyk",
    "kykkkyykkkyk",
    "kyyykyykyyyk",
    ".kkkkyykkkk.",
    "....kyyk....",
    "...kYYYYk...",
    "...kkkkkk...",
  ],
  ui_menu: [
    "....kkkk....",
    "..kkkssKk...",
    ".kssssssSk..",
    "kksskkkkssk.",
    "kssk.ww.kssk",
    "kssk.ww.kssk",
    "kksskkkkssk.",
    ".kssssssSk..",
    "..kkkssSk...",
    "....kkkk....",
    "............",
    "............",
  ],
};

// The metal of each gear tier: the letter m in the gear grids.
const cache = new Map<string, string>();

// The icon for a skill (by class and slot), a potion or an item of gear (by id), as an image URL.
// Null where there is no canvas (tests).
// Items (potions, gear, materials) are pictures from the 496 RPG icons pack (Henrique Lazarini, CC0),
// one file each under assets/ui/items; everything else is drawn from the grids above.
export function iconFor(id: string): string | null {
  if (id in ITEMS) return publicUrl(`assets/ui/items/${id}.png`);
  if (typeof document === "undefined") return null;
  const cached = cache.get(id);
  if (cached) return cached;
  const rows = ICONS[id];
  if (!rows) return null;
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const colour = PALETTE[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  const url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}

export function skillIconId(playerClass: string, slot: number): string {
  return `${playerClass}_${slot}`;
}

// For tests: every grid is square and uses only known letters.
export function iconGrids(): Record<string, string[]> {
  return ICONS;
}

export function knownIconLetters(): Set<string> {
  return new Set([...Object.keys(PALETTE), "."]);
}
