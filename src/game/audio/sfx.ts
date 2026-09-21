import { settings } from "../../ui/settings";

// Combat sounds made on the fly with Web Audio (no files to load): a swing's whoosh, a bow's twang,
// a spell's zap, a hit's thump, a skill's chime and your own hurt grunt.

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
