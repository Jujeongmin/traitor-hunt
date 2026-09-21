import type { ZoneId } from "../world/zones";

// The four pieces of music the game owns. All four are CC0 (see docs/licenses).
export type Track = "menu" | "explore" | "tension" | "boss";

export const MUSIC_FILES: Record<Track, string> = {
  menu: "assets/music/menu.ogg",
  explore: "assets/music/explore.ogg",
  tension: "assets/music/tension.ogg",
  boss: "assets/music/boss.ogg",
};

// What should be playing in a zone: the calm piece in the village, the wandering one in the fields,
// the boss's in the boss's clearing. Outside the world (the menus) the menu piece plays.
export function trackFor(zone: ZoneId | null): Track {
  switch (zone) {
    case null:
    case "village":
      return "menu";
    case "forest1":
    case "forest2":
      return "explore";
    case "boss":
      return "boss";
  }
}
