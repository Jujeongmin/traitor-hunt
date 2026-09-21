// Who you look like: one of the RPG Tiny Hero Duo pair (Dungeon Mason), each with their own sword
// and shield. The id is what the server stores and the match carries; the model is the GLB it draws.
export interface Costume {
  id: string;
  name: string;
  model: string;
}

export const COSTUMES: readonly Costume[] = [
  { id: "hero", name: "용사", model: "hero_male" },
  { id: "heroine", name: "여용사", model: "hero_female" },
];

export const COSTUME_MODELS = [...new Set(COSTUMES.map((c) => c.model))];

// Seats get different costumes so players can tell each other apart.
export function costumeForSeat(seat: number): Costume {
  const n = COSTUMES.length;
  return COSTUMES[((seat % n) + n) % n];
}

export function costumeById(id: unknown): Costume | null {
  return COSTUMES.find((c) => c.id === id) ?? null;
}

// What a player wears in a match: the costume they picked in the menu, and the seat's own costume
// for bots and for anyone whose choice the match never heard of.
export function wearing(
  looks: Record<string, string> | undefined, account: string, seat: number,
): Costume {
  return costumeById(looks?.[account]) ?? costumeForSeat(seat);
}
