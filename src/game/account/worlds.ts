// The game servers you pick from when you start. Each is its own world: matchmaking only seats
// players who picked the same one.
export const WORLD_NAME = "초록숲";

export const WORLDS = [1, 2, 3, 4].map((n) => ({ id: `w${n}`, name: `${WORLD_NAME}-${n}` }));

export type World = (typeof WORLDS)[number];

// Accounts that never picked one (older saves, the test seats) play on the first.
export const DEFAULT_WORLD = WORLDS[0];

export function readWorld(id: unknown): World | null {
  return WORLDS.find((w) => w.id === id) ?? null;
}
