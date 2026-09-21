import type { JobId } from "../combat/jobs";
import { RuleViolation } from "../world/types";
import type { QuestProgress } from "./quests";

// Everything a character can carry, in one table: potions to drink, and a weapon and armour to wear.
// Gear fits every class. Prices are in gold, the game's coin (a Verse8 $asset on the account).

export const GOLD = "gold";

export type ItemId =
  | "potion_small" | "potion_big"
  | "weapon_1" | "weapon_2" | "weapon_3"
  | "armor_1" | "armor_2" | "armor_3";

export type Slot = "weapon" | "armor";

export interface ItemSpec {
  name: string;
  // What the bag shows under the name.
  blurb: string;
  // A potion is drunk; gear is worn in its slot.
  kind: "potion" | Slot;
  // Gold at the village shop; null when only monsters drop it. Selling gives back half.
  price: number | null;
  // Potion: health it gives back.
  heal: number;
  // Weapon: extra share of damage on every hit and skill.
  power: number;
  // Armour: extra health, and the share of every blow it stops.
  hp: number;
  guard: number;
}

const none = { heal: 0, power: 0, hp: 0, guard: 0 };

export const ITEMS: Record<ItemId, ItemSpec> = {
  potion_small: { ...none, name: "작은 물약", blurb: "체력 40 회복", kind: "potion", price: 20, heal: 40 },
  potion_big: { ...none, name: "큰 물약", blurb: "체력 120 회복", kind: "potion", price: 70, heal: 120 },
  weapon_1: { ...none, name: "견습생의 무기", blurb: "공격력 +10%", kind: "weapon", price: 150, power: 0.1 },
  weapon_2: { ...none, name: "숲지기의 무기", blurb: "공격력 +25%", kind: "weapon", price: 600, power: 0.25 },
  weapon_3: { ...none, name: "버섯왕의 무기", blurb: "공격력 +45%", kind: "weapon", price: null, power: 0.45 },
  armor_1: { ...none, name: "가죽 갑옷", blurb: "체력 +25", kind: "armor", price: 120, hp: 25 },
  armor_2: { ...none, name: "숲지기의 갑옷", blurb: "체력 +60, 받는 피해 -10%", kind: "armor", price: 500, hp: 60, guard: 0.1 },
  armor_3: { ...none, name: "버섯왕의 갑옷", blurb: "체력 +100, 받는 피해 -20%", kind: "armor", price: null, hp: 100, guard: 0.2 },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
// What the shop sells, in shelf order.
export const SHOP_ITEMS = ITEM_IDS.filter((id) => ITEMS[id].price !== null);
// No stack grows past this.
export const MAX_STACK = 99;

export function readItemId(value: unknown): ItemId | null {
  return typeof value === "string" && value in ITEMS ? (value as ItemId) : null;
}

// How many of each item a character carries. Only items it has are listed.
export type Bag = Partial<Record<ItemId, number>>;

export interface Gear { weapon: ItemId | null; armor: ItemId | null }

export const NO_GEAR: Gear = { weapon: null, armor: null };

export function readBag(raw: unknown): Bag {
  const out: Bag = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    const item = readItemId(id);
    if (item && typeof n === "number" && Number.isInteger(n) && n > 0) out[item] = Math.min(n, MAX_STACK);
  }
  return out;
}

export function readGear(raw: unknown): Gear {
  const g = (raw ?? {}) as Record<string, unknown>;
  const worn = (slot: Slot) => {
    const id = readItemId(g[slot]);
    return id && ITEMS[id].kind === slot ? id : null;
  };
  return { weapon: worn("weapon"), armor: worn("armor") };
}

// The bag with n more of an item (never past MAX_STACK), or n fewer; fewer than it has is refused.
export function addItem(bag: Bag, id: ItemId, n: number): Bag {
  const have = bag[id] ?? 0;
  const next = have + n;
  if (next < 0) throw new RuleViolation("no_item");
  const out = { ...bag };
  if (next === 0) delete out[id];
  else out[id] = Math.min(next, MAX_STACK);
  return out;
}

// Wears an item from the bag; whatever was in that slot goes back into the bag.
export function equip(bag: Bag, gear: Gear, id: ItemId): { bag: Bag; gear: Gear } {
  const kind = ITEMS[id].kind;
  if (kind === "potion") throw new RuleViolation("unavailable");
  let next = addItem(bag, id, -1);
  const old = gear[kind];
  if (old) next = addItem(next, old, 1);
  return { bag: next, gear: { ...gear, [kind]: id } };
}

export function unequip(bag: Bag, gear: Gear, slot: Slot): { bag: Bag; gear: Gear } {
  const old = gear[slot];
  if (!old) return { bag, gear };
  return { bag: addItem(bag, old, 1), gear: { ...gear, [slot]: null } };
}

// What the worn gear adds up to in a fight.
export interface GearStats { power: number; hp: number; guard: number }

export function gearStats(gear: Gear): GearStats {
  const out = { power: 0, hp: 0, guard: 0 };
  for (const id of [gear.weapon, gear.armor]) {
    if (!id) continue;
    out.power += ITEMS[id].power;
    out.hp += ITEMS[id].hp;
    out.guard += ITEMS[id].guard;
  }
  return out;
}

// A character's things as the bag screen shows them, with the account's gold: its bag and gear, its
// advanced class (전직) and where it is in the quests.
export interface BagView {
  gold: number;
  bag: Bag;
  gear: Gear;
  job: JobId | null;
  quest: QuestProgress;
}

export function sellPrice(id: ItemId): number {
  const price = ITEMS[id].price;
  // Drop-only gear has no shop price; the shop pays a flat sum for it.
  if (price === null) return 400;
  return Math.floor(price / 2);
}
