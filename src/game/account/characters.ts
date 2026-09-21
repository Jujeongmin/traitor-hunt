import { readClass, type PlayerClass } from "../combat/classes";
import { costumeById } from "../render/costumes";
import { readZone, type ZoneId } from "../world/zones";
import { levelOf, readXp, type LevelView } from "./level";

// An account holds characters on each server. One of them is active: the one the menus show and
// the one that walks into the world. Its class and look are fixed when it is made.
export const CHARACTERS_PER_WORLD = 4;

// Where a character last stood, so it comes back to the same spot.
export interface Spot { zone: ZoneId; x: number; z: number }

export interface Character {
  id: string;
  world: string;
  name: string;
  playerClass: PlayerClass;
  costume: string;
  xp: number;
  spot: Spot | null;
}

// What the menus show of a character.
export interface CharacterView {
  id: string;
  name: string;
  playerClass: PlayerClass;
  costume: string;
  xp: number;
  level: LevelView;
}

export function readSpot(raw: unknown): Spot | null {
  const s = raw as Partial<Spot> | undefined;
  const zone = readZone(s?.zone);
  if (!zone || typeof s?.x !== "number" || typeof s?.z !== "number" || !Number.isFinite(s.x) || !Number.isFinite(s.z)) {
    return null;
  }
  return { zone, x: s.x, z: s.z };
}

// Saved characters, trusted only as far as each one reads back whole.
export function readCharacters(raw: unknown): Character[] {
  if (!Array.isArray(raw)) return [];
  const out: Character[] = [];
  for (const item of raw) {
    const c = item as Partial<Record<keyof Character, unknown>> | null;
    const playerClass = readClass(c?.playerClass);
    const costume = costumeById(c?.costume);
    if (!c || typeof c.id !== "string" || typeof c.world !== "string" || typeof c.name !== "string" || !playerClass || !costume) {
      continue;
    }
    out.push({ id: c.id, world: c.world, name: c.name, playerClass, costume: costume.id, xp: readXp(c.xp), spot: readSpot(c.spot) });
  }
  return out;
}

export function characterView(c: Character): CharacterView {
  return { id: c.id, name: c.name, playerClass: c.playerClass, costume: c.costume, xp: c.xp, level: levelOf(c.xp) };
}
