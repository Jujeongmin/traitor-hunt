import type { ZoneId } from "../world/zones";

// The game's music: calm, looping pieces by Juhani Junkala (JRPG Music Packs 1, 2, 4 and 5) and
// Cleyton Kauffman (Forest Whisper Theme), all CC0 (see docs/licenses).
export type Track = "menu" | "village" | "field" | "field2" | "deep" | "boss";

export const MUSIC_FILES: Record<Track, string> = {
  menu: "assets/music/menu.ogg",
  village: "assets/music/village.ogg",
  field: "assets/music/field.ogg",
  field2: "assets/music/field2.ogg",
  deep: "assets/music/deep.ogg",
  boss: "assets/music/boss.ogg",
};

// Each piece is mastered at its own loudness; these bring them all down to the quiet level of the
// deep forest's (about -31 dB RMS, measured 2026-09-22), so the music sits under the sound effects.
// The boss's fight is let a little louder.
export const MUSIC_LEVEL: Record<Track, number> = {
  menu: 0.23, village: 0.17, field: 0.15, field2: 0.16, deep: 1, boss: 0.23,
};

// What should be playing: the menu's piece outside the world, the village's at home, a wandering
// piece in each field, the whispering forest deep in, and the fight at the boss.
export function trackFor(zone: ZoneId | null): Track {
  switch (zone) {
    case null:
      return "menu";
    case "village":
      return "village";
    case "forest1":
      return "field";
    case "forest2":
      return "field2";
    case "forest3":
      return "deep";
    case "boss":
      return "boss";
  }
}
