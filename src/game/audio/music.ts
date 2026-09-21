import { MusicPlayer } from "./MusicPlayer";
import type { Track } from "./musicTrack";
import { onSettings, settings } from "../../ui/settings";

let player: MusicPlayer | null = null;

function live(): MusicPlayer {
  if (!player) {
    player = new MusicPlayer();
    player.setVolume(settings().music);
    onSettings((s) => player?.setVolume(s.music));
  }
  return player;
}

// Asks for a track; the player fades between them and follows the music setting.
export function playMusic(track: Track): void {
  live().play(track);
}
