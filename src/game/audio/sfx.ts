import { settings } from "../../ui/settings";
import { publicUrl } from "../assets/publicUrl";

// Recorded sound effects (CC0: artisticdude's RPG Sound Pack and Swishes, rubberduck's 80 CC0 RPG SFX,
// StarNinjas' sword sounds; see docs/licenses/asset-provenance.md), picked by ear one by one. Each is
// fetched and decoded once, the first time it is wanted (or when preloadCues asks), and played at its
// own level: the levels bring the loudest moment of each to about the same loudness, fights a little
// above the menus.
const CUES = {
  swing: { file: "swing.ogg", level: 0.2 },
  arrow: { file: "arrow.wav", level: 0.27 },
  bolt: { file: "bolt.ogg", level: 3.3 },
  skill: { file: "skill.ogg", level: 1.35 },
  die: { file: "die.ogg", level: 0.32 },
  potion: { file: "potion.wav", level: 0.23 },
  gold: { file: "gold.wav", level: 0.28 },
  click: { file: "click.wav", level: 0.17 },
  open: { file: "cloth.wav", level: 0.15 },
  close: { file: "cloth.wav", level: 0.12 },
  enhance_ok: { file: "enhance_ok.wav", level: 0.21 },
  enhance_fail: { file: "enhance_fail.ogg", level: 0.66 },
  enhance_break: { file: "enhance_break.ogg", level: 0.6 },
} as const;
export type Cue = keyof typeof CUES;

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  audio ??= new AudioContext();
  return audio;
}

// Decoded files, by file name (two cues may share one).
const buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null>>();

function load(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  const loading = fetch(publicUrl(`assets/sfx/${file}`))
    .then((r) => r.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      buffers.set(file, buffer);
      return buffer;
    })
    .catch(() => null);
  buffers.set(file, loading);
  return loading;
}

export function preloadCues(): void {
  const ctx = context();
  if (!ctx) return;
  for (const { file } of Object.values(CUES)) if (!buffers.has(file)) void load(ctx, file);
}

export function playCue(cue: Cue): void {
  const ctx = context();
  if (!ctx) return;
  const { file, level: own } = CUES[cue];
  const level = own * settings().volume;
  if (level <= 0) return;
  const play = (buffer: AudioBuffer | null) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // A little higher or lower each time, so a sound heard over and over does not drone.
    if (cue === "swing" || cue === "arrow") source.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(ctx.destination);
    source.start();
  };
  const held = buffers.get(file);
  if (held instanceof AudioBuffer) play(held);
  else void (held ?? load(ctx, file)).then(play);
}
