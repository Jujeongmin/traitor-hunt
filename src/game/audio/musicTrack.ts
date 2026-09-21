import { isActive } from "../match/lifecycle";
import type { PublicMatch } from "../match/types";

// The four pieces of music the game owns. All four are CC0 (see docs/licenses).
export type Track = "menu" | "explore" | "tension" | "boss";

export const MUSIC_FILES: Record<Track, string> = {
  menu: "assets/music/menu.ogg",
  explore: "assets/music/explore.ogg",
  tension: "assets/music/tension.ogg",
  boss: "assets/music/boss.ogg",
};

// What should be playing: the menu piece everywhere outside a live match, and inside one the piece
// that fits the objective. A player who is down or already out hears the menu piece again.
export function trackFor(match: PublicMatch | null, account: string): Track {
  if (!match || match.phase !== "playing" || !isActive(match, account)) return "menu";
  switch (match.objectives.stage) {
    case "shards":
    case "devices":
      return "explore";
    case "boss":
      return "boss";
    case "seal":
    case "exit":
      return "tension";
  }
}
