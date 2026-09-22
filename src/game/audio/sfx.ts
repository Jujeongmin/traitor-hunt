import { settings } from "../../ui/settings";
import { publicUrl } from "../assets/publicUrl";

// Combat sounds made on the fly with Web Audio (no files to load): a swing's whoosh, a bow's twang,
// a spell's zap, a hit's thump, a skill's chime and your own hurt grunt. (Recorded cues below.)

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  audio ??= new AudioContext();
  return audio;
}

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

// A gain that starts at level and dies away over seconds.
function envelope(ctx: AudioContext, level: number, seconds: number): GainNode {
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(Math.max(0.0001, level * settings().volume), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  gain.connect(ctx.destination);
  return gain;
}

function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, seconds: number, level: number): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
  osc.connect(envelope(ctx, level, seconds));
  osc.start(t);
  osc.stop(t + seconds);
}

export function playSwing(): void {
  const ctx = context();
  if (!ctx) return;
  const source = noise(ctx, 0.22);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  const t = ctx.currentTime;
  filter.frequency.setValueAtTime(600, t);
  filter.frequency.exponentialRampToValueAtTime(2200, t + 0.18);
  source.connect(filter).connect(envelope(ctx, 0.35, 0.22));
  source.start();
}

export function playShot(kind: "arrow" | "bolt"): void {
  const ctx = context();
  if (!ctx) return;
  if (kind === "arrow") tone(ctx, "triangle", 420, 180, 0.18, 0.4);
  else {
    tone(ctx, "sawtooth", 900, 220, 0.3, 0.18);
    tone(ctx, "sine", 1400, 500, 0.25, 0.2);
  }
}

export function playHit(): void {
  const ctx = context();
  if (!ctx) return;
  tone(ctx, "sine", 160, 60, 0.16, 0.6);
  const source = noise(ctx, 0.08);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  source.connect(filter).connect(envelope(ctx, 0.35, 0.08));
  source.start();
}

export function playSkill(): void {
  const ctx = context();
  if (!ctx) return;
  tone(ctx, "sine", 520, 1040, 0.35, 0.25);
  tone(ctx, "triangle", 780, 1560, 0.45, 0.15);
}

export function playHurt(): void {
  const ctx = context();
  if (!ctx) return;
  tone(ctx, "square", 220, 110, 0.18, 0.12);
}

// Recorded sounds for everything else: jingles, the forge, the potion, the menus and footsteps on the
// grass (Kenney's Music Jingles, Interface Sounds and Impact Sounds, CC0). Each is fetched and decoded
// once, the first time it is wanted (or when preloadCues asks), and played at its own level.
const CUES = {
  levelup: 0.55, quest: 0.55, enhance_ok: 0.5, enhance_fail: 0.5, enhance_break: 0.6, potion: 0.45, click: 0.3, open: 0.35,
  close: 0.3, step_0: 0.22, step_1: 0.22, step_2: 0.22, step_3: 0.22,
} as const;
export type Cue = keyof typeof CUES;

const cueBuffers = new Map<Cue, AudioBuffer | Promise<AudioBuffer | null>>();

function loadCue(ctx: AudioContext, cue: Cue): Promise<AudioBuffer | null> {
  const loading = fetch(publicUrl(`assets/sfx/${cue}.ogg`))
    .then((r) => r.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buffer) => {
      cueBuffers.set(cue, buffer);
      return buffer;
    })
    .catch(() => null);
  cueBuffers.set(cue, loading);
  return loading;
}

export function preloadCues(): void {
  const ctx = context();
  if (!ctx) return;
  for (const cue of Object.keys(CUES) as Cue[]) if (!cueBuffers.has(cue)) void loadCue(ctx, cue);
}

export function playCue(cue: Cue): void {
  const ctx = context();
  if (!ctx) return;
  const level = CUES[cue] * settings().volume;
  if (level <= 0) return;
  const play = (buffer: AudioBuffer | null) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(ctx.destination);
    source.start();
  };
  const held = cueBuffers.get(cue);
  if (held instanceof AudioBuffer) play(held);
  else void (held ?? loadCue(ctx, cue)).then(play);
}

// One footstep on the grass, a different one each time.
let lastStep = 0;
export function playStep(): void {
  lastStep = (lastStep + 1 + Math.floor(Math.random() * 3)) % 4;
  playCue(`step_${lastStep}` as Cue);
}
