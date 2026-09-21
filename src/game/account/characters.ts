import { readClass, type PlayerClass } from "../combat/classes";
import { costumeById } from "../render/costumes";
import { readZone, type ZoneId } from "../world/zones";
import { readBag, readGear, type Bag, type Gear } from "./items";
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
  // When it was made (ms), for listing in order; 0 for characters from before this was kept.
  made: number;
  // What it carries, and what it wears.
  bag: Bag;
  gear: Gear;
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

// Saved characters, trusted only as far as each one reads back whole, oldest first. They are saved as
// an object keyed by id (see saveProfile); an array is read too, from the first saves.
export function readCharacters(raw: unknown): Character[] {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
  const out: Character[] = [];
  for (const item of items) {
    const c = item as Partial<Record<keyof Character, unknown>> | null;
    const playerClass = readClass(c?.playerClass);
    const costume = costumeById(c?.costume);
    if (!c || typeof c.id !== "string" || typeof c.world !== "string" || typeof c.name !== "string" || !playerClass || !costume) {
      continue;
    }
    const made = typeof c.made === "number" && Number.isFinite(c.made) ? c.made : 0;
    out.push({
      id: c.id, world: c.world, name: c.name, playerClass, costume: costume.id, xp: readXp(c.xp), spot: readSpot(c.spot), made,
      bag: readBag(c.bag), gear: readGear(c.gear),
    });
  }
  return out.sort((a, b) => a.made - b.made);
}

// The characters as saved: an object keyed by id. The platform keeps objects as they are, which a
// top-level array may not survive.
export function characterMap(characters: readonly Character[]): Record<string, Character> {
  return Object.fromEntries(characters.map((c) => [c.id, c]));
}

// The XP an account earned in the old match game, by that game's rules (10 a game, 20 a win,
// 10 an escape, 2 a monster). Its record is still on the account; this carries it into the character.
export function legacyMatchXp(raw: unknown): number {
  const p = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return n(p.games) * 10 + n(p.wins) * 20 + n(p.escapes) * 10 + n(p.monsterKills) * 2;
}

export function characterView(c: Character): CharacterView {
  return { id: c.id, name: c.name, playerClass: c.playerClass, costume: c.costume, xp: c.xp, level: levelOf(c.xp) };
}
