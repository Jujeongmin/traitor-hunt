import { ITEMS, MAX_PLUS, type Bag, type ItemId } from "./items";

// The village smith: enhancing worn gear (+1 to +10) and making gear and potions from what monsters
// drop. The server rolls every attempt; these tables are what it and the smith's screen go by.

// The chance of reaching each + (index 1 is +1), and, for a failure on the way to +6 and above, the
// chance the gear breaks and is lost. Below +6 a failure only costs what was spent.
const SUCCESS = [0, 1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
const BREAK = [0, 0, 0, 0, 0, 0, 0.1, 0.15, 0.2, 0.25, 0.3];
// From this + on, a failure may break the gear.
export const BREAK_FROM = 6;

export interface EnhanceCost {
  // The + the attempt goes for.
  to: number;
  gold: number;
  stones: number;
  success: number;
  // The chance a failed attempt breaks the gear.
  breaks: number;
}

// What going from `plus` to the next + costs for a piece of gear, and its odds; null at +10.
export function enhanceCost(id: ItemId, plus: number): EnhanceCost | null {
  const to = plus + 1;
  if (to > MAX_PLUS) return null;
  const tier = ITEMS[id].tier ?? 1;
  return { to, gold: 60 * tier * to, stones: to, success: SUCCESS[to], breaks: BREAK[to] };
}

export type EnhanceOutcome = "success" | "fail" | "broken";

// How an attempt went, from two numbers in [0, 1): one for success, one for breaking.
export function rollEnhance(cost: EnhanceCost, successRoll: number, breakRoll: number): EnhanceOutcome {
  if (successRoll < cost.success) return "success";
  return breakRoll < cost.breaks ? "broken" : "fail";
}

export interface Recipe {
  id: string;
  makes: ItemId;
  // How many it makes.
  n: number;
  gold: number;
  needs: { item: ItemId; n: number }[];
}

// What the smith makes, in the order the screen lists it: from the first field's jelly up to the
// boss's spores.
export const RECIPES: readonly Recipe[] = [
  { id: "potion_big", makes: "potion_big", n: 2, gold: 30, needs: [{ item: "jelly", n: 4 }] },
  { id: "weapon_1", makes: "weapon_1", n: 1, gold: 80, needs: [{ item: "jelly", n: 6 }] },
  { id: "armor_1", makes: "armor_1", n: 1, gold: 60, needs: [{ item: "jelly", n: 6 }] },
  { id: "weapon_4", makes: "weapon_4", n: 1, gold: 1500, needs: [{ item: "silk", n: 10 }, { item: "stone", n: 4 }] },
  { id: "armor_4", makes: "armor_4", n: 1, gold: 1300, needs: [{ item: "silk", n: 10 }, { item: "stone", n: 4 }] },
  { id: "weapon_5", makes: "weapon_5", n: 1, gold: 4000, needs: [{ item: "core", n: 12 }, { item: "stone", n: 8 }] },
  { id: "armor_5", makes: "armor_5", n: 1, gold: 3500, needs: [{ item: "core", n: 12 }, { item: "stone", n: 8 }] },
  { id: "weapon_3", makes: "weapon_3", n: 1, gold: 6000, needs: [{ item: "spore", n: 4 }, { item: "core", n: 6 }] },
  { id: "armor_3", makes: "armor_3", n: 1, gold: 5500, needs: [{ item: "spore", n: 4 }, { item: "core", n: 6 }] },
];

export function readRecipe(value: unknown): Recipe | null {
  return RECIPES.find((r) => r.id === value) ?? null;
}

// Whether the bag holds every material a recipe needs.
export function hasMaterials(bag: Bag, recipe: Recipe): boolean {
  return recipe.needs.every((need) => (bag[need.item] ?? 0) >= need.n);
}
