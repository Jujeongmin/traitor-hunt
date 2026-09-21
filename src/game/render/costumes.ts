// What a hero looks like. The RPG Tiny Hero Duo (Dungeon Mason) is one modular character: every part
// comes in more than one version, and a costume picks one of each. The server stores and the match
// carries the costume as its id: one digit per part, in PART_KEYS order (e.g. "000000000000").
// The last four parts are colours rather than meshes (see dyes.ts).

// How a colour part repaints: "paint" gives the whole part one colour, keeping its shading; "skin"
// repaints only the skin; "hue" turns every colour but the skin round the colour wheel.
export type Dye =
  | { kind: "paint"; rgb: readonly [number, number, number] }
  | { kind: "skin"; rgb: readonly [number, number, number] }
  | { kind: "hue"; degrees: number; saturation: number };

export interface PartOption {
  name: string;
  // The mesh drawn for this option; null draws nothing (no cloak). Colour parts draw no mesh.
  mesh?: string | null;
  // A colour part's repaint; left out for the pack's own colours.
  dye?: Dye;
}

export interface Part {
  label: string;
  // "shape" parts pick a mesh, "colour" parts repaint the meshes that are shown.
  group: "shape" | "colour";
  options: readonly PartOption[];
}

const paint = (name: string, r: number, g: number, b: number): PartOption => ({ name, dye: { kind: "paint", rgb: [r, g, b] } });
const skin = (name: string, r: number, g: number, b: number): PartOption => ({ name, dye: { kind: "skin", rgb: [r, g, b] } });
const hue = (name: string, degrees: number, saturation = 1): PartOption => ({ name, dye: { kind: "hue", degrees, saturation } });
const HUES: readonly PartOption[] = [
  { name: "기본" }, hue("염색 1", 60), hue("염색 2", 120), hue("염색 3", 180), hue("염색 4", 240), hue("염색 5", 300),
  hue("무채색", 0, 0),
];

export const PARTS = {
  head: { label: "얼굴", group: "shape", options: [{ name: "둥근 얼굴", mesh: "Head01_Male" }, { name: "갸름한 얼굴", mesh: "Head02_Female" }] },
  hair: { label: "머리", group: "shape", options: [{ name: "삐죽 머리", mesh: "Hair01" }, { name: "긴 머리", mesh: "Hair06" }] },
  eyes: { label: "눈", group: "shape", options: [{ name: "또렷한 눈", mesh: "Eye01" }, { name: "큰 눈", mesh: "Eye02" }] },
  mouth: { label: "입", group: "shape", options: [{ name: "다문 입", mesh: "Mouth01" }, { name: "웃는 입", mesh: "Mouth02" }] },
  body: { label: "옷", group: "shape", options: [{ name: "모험가 옷", mesh: "Body05" }, { name: "기사 옷", mesh: "Body10" }] },
  cloak: {
    label: "망토",
    group: "shape",
    options: [{ name: "짧은 망토", mesh: "Cloak02" }, { name: "긴 망토", mesh: "Cloak03" }, { name: "망토 없음", mesh: null }],
  },
  weapon: { label: "검", group: "shape", options: [{ name: "곧은 검", mesh: "OHS03Polyart" }, { name: "넓은 검", mesh: "OHS06Polyart" }] },
  shield: { label: "방패", group: "shape", options: [{ name: "둥근 방패", mesh: "Shield08Polyart" }, { name: "문장 방패", mesh: "Shield05Polyart" }] },
  hairColor: {
    label: "머리색",
    group: "colour",
    options: [
      { name: "기본" }, paint("갈색", 110, 62, 30), paint("검정", 40, 36, 38), paint("금발", 240, 205, 110),
      paint("빨강", 200, 50, 35), paint("은발", 215, 215, 225), paint("파랑", 60, 110, 220), paint("분홍", 240, 110, 190),
      paint("초록", 80, 170, 90),
    ],
  },
  skin: {
    label: "피부",
    group: "colour",
    options: [{ name: "기본" }, skin("밝은", 245, 208, 170), skin("구릿빛", 190, 126, 76), skin("짙은", 122, 80, 52)],
  },
  clothColor: { label: "옷 색", group: "colour", options: HUES },
  cloakColor: { label: "망토 색", group: "colour", options: HUES },
} as const satisfies Record<string, Part>;

export type PartKey = keyof typeof PARTS;
export const PART_KEYS = Object.keys(PARTS) as PartKey[];
export type CostumeParts = Record<PartKey, number>;

export interface Costume {
  id: string;
  name: string;
  model: string;
  parts: CostumeParts;
}

const MODEL = "hero";
export const COSTUME_MODELS = [MODEL];

export function encodeCostume(parts: CostumeParts): string {
  return PART_KEYS.map((k) => String(parts[k])).join("");
}

function make(parts: CostumeParts, name = "나만의 용사"): Costume {
  return { id: encodeCostume(parts), name, model: MODEL, parts };
}

const PACK_COLOURS = { hairColor: 0, skin: 0, clothColor: 0, cloakColor: 0 };

// Ready-made looks: the pack's own two heroes.
export const COSTUMES: readonly Costume[] = [
  make({ head: 0, hair: 0, eyes: 0, mouth: 0, body: 0, cloak: 0, weapon: 0, shield: 0, ...PACK_COLOURS }, "용사"),
  make({ head: 1, hair: 1, eyes: 1, mouth: 1, body: 1, cloak: 1, weapon: 1, shield: 1, ...PACK_COLOURS }, "여용사"),
];
// Ids from before the colour parts: the shape digits alone, worn in the pack's colours.
const SHAPE_DIGITS = PART_KEYS.filter((k) => PARTS[k].group === "shape").length;
// The ids saved before costumes had parts.
const OLD_IDS: Record<string, Costume> = { hero: COSTUMES[0], heroine: COSTUMES[1] };

// Reads a costume id: one digit per part, each within its part's options. Anything else is null.
export function costumeById(raw: unknown): Costume | null {
  if (typeof raw !== "string") return null;
  if (OLD_IDS[raw]) return OLD_IDS[raw];
  const id = raw.length === SHAPE_DIGITS ? raw.padEnd(PART_KEYS.length, "0") : raw;
  if (id.length !== PART_KEYS.length || !/^\d+$/.test(id)) return null;
  const parts = {} as CostumeParts;
  for (let i = 0; i < PART_KEYS.length; i++) {
    const key = PART_KEYS[i];
    const n = Number(id[i]);
    if (n >= PARTS[key].options.length) return null;
    parts[key] = n;
  }
  return COSTUMES.find((c) => c.id === id) ?? make(parts);
}

// The same costume with one part stepped to its next (or previous) option.
export function withPart(costume: Costume, key: PartKey, step: number): Costume {
  const n = PARTS[key].options.length;
  const parts = { ...costume.parts, [key]: (((costume.parts[key] + step) % n) + n) % n };
  return costumeById(encodeCostume(parts))!;
}

// A random costume, for the menu's dice button.
export function randomCostume(random: () => number = Math.random): Costume {
  const parts = {} as CostumeParts;
  for (const key of PART_KEYS) parts[key] = Math.floor(random() * PARTS[key].options.length);
  return costumeById(encodeCostume(parts))!;
}

// The option a costume picked for one part.
export function optionOf(costume: Costume, key: PartKey): PartOption {
  return (PARTS[key].options as readonly PartOption[])[costume.parts[key]];
}

// The mesh names a costume draws.
export function shownMeshes(costume: Costume): Set<string> {
  const shown = new Set<string>();
  for (const key of PART_KEYS) {
    const mesh = optionOf(costume, key)?.mesh;
    if (mesh) shown.add(mesh);
  }
  return shown;
}

// Every part mesh the model carries, shown or not.
export const PART_MESHES = new Set<string>(
  PART_KEYS.flatMap((k) => (PARTS[k].options as readonly PartOption[]).map((o) => o.mesh).filter((m): m is string => typeof m === "string")),
);

// Seats get different presets so players can tell each other apart.
export function costumeForSeat(seat: number): Costume {
  const n = COSTUMES.length;
  return COSTUMES[((seat % n) + n) % n];
}

// What a player wears in a match: the costume they picked in the menu, and the seat's own preset
// for bots and for anyone whose choice the match never heard of.
export function wearing(
  looks: Record<string, string> | undefined, account: string, seat: number,
): Costume {
  return costumeById(looks?.[account]) ?? costumeForSeat(seat);
}
