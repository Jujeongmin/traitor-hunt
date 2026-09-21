// Rounded, friendly type for a chibi fantasy game: Jua for titles and buttons, Gowun Dodum for
// reading, Black Han Sans for the logo.
import "@fontsource/jua";
import "@fontsource/gowun-dodum";
import "@fontsource/black-han-sans";
import { publicUrl } from "../game/assets/publicUrl";

// UI art cut from the store packs by scripts/extract-ui.mjs. Paths go through publicUrl because
// the game is served from a sub-path, which plain CSS urls cannot know about.
const PIECES = ["grunge_band", "grunge_frame"] as const;

export const ICONS = {
  heart: publicUrl("assets/ui/icon_heart.webp"),
  skull: publicUrl("assets/ui/icon_skull.webp"),
  traitor: publicUrl("assets/ui/icon_traitor.webp"),
  adventurer: publicUrl("assets/ui/icon_adventurer.webp"),
  hand: publicUrl("assets/ui/icon_hand.webp"),
  bound: publicUrl("assets/ui/icon_bound.webp"),
} as const;

export function installUiTheme(): void {
  const style = document.documentElement.style;
  for (const piece of PIECES) {
    style.setProperty(`--ui-${piece.replace(/_/g, "-")}`, `url("${publicUrl(`assets/ui/${piece}.webp`)}")`);
  }
}
