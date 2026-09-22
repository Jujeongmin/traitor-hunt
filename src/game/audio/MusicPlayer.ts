import { publicUrl } from "../assets/publicUrl";
import { MUSIC_FILES, MUSIC_LEVEL, type Track } from "./musicTrack";

// How long one piece takes to fade out while the next fades in.
export const CROSSFADE_MS = 2000;
const STEP_MS = 50;

// What the player needs from an audio element, so tests can hand it a fake one.
export interface MusicElement {
  volume: number;
  loop: boolean;
  play(): Promise<void>;
  pause(): void;
  currentTime: number;
}

// Asks to be called back the next time the page is touched, so a refused start can be retried.
export type WaitForTouch = (again: () => void) => void;

const waitForTouch: WaitForTouch = (again) => {
  if (typeof window === "undefined") return;
  const once = () => {
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
    again();
  };
  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
};

function makeAudio(src: string): MusicElement {
  const audio = new Audio(publicUrl(src));
  audio.preload = "none";
  return audio;
}

// Plays one looping track at a time, fading between them. Browsers refuse to start audio before the
// page is touched, so a refused start is retried on the first click or key press.
export class MusicPlayer {
  private readonly loaded = new Map<Track, MusicElement>();
  private readonly gains = new Map<Track, number>();
  private wanted: Track | null = null;
  private volume = 0.5;
  private timer: ReturnType<typeof setInterval> | null = null;
  private waitingForTouch = false;
  private disposed = false;

  constructor(
    private readonly create: (src: string) => MusicElement = makeAudio,
    private readonly onTouch: WaitForTouch = waitForTouch,
  ) {}

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.apply();
    // Turning the music back up after silence starts it again.
    if (this.volume > 0 && this.wanted) {
      this.start(this.wanted);
      this.run();
    }
  }

  play(track: Track | null): void {
    if (this.disposed || track === this.wanted) return;
    this.wanted = track;
    if (track) this.start(track);
    this.run();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const element of this.loaded.values()) element.pause();
    this.loaded.clear();
    this.gains.clear();
  }

  private element(track: Track): MusicElement {
    let element = this.loaded.get(track);
    if (!element) {
      element = this.create(MUSIC_FILES[track]);
      element.loop = true;
      element.volume = 0;
      this.loaded.set(track, element);
    }
    return element;
  }

  private start(track: Track): void {
    if (this.volume === 0) return;
    const element = this.element(track);
    void Promise.resolve(element.play()).catch(() => this.retryOnTouch());
  }

  private retryOnTouch(): void {
    if (this.waitingForTouch) return;
    this.waitingForTouch = true;
    this.onTouch(() => {
      this.waitingForTouch = false;
      if (this.wanted && !this.disposed) this.start(this.wanted);
    });
  }

  // One interval drives every fade; it stops once nothing is moving.
  private run(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), STEP_MS);
  }

  private step(): void {
    const stride = STEP_MS / CROSSFADE_MS;
    let moving = false;
    for (const track of this.loaded.keys()) {
      const goal = track === this.wanted ? 1 : 0;
      const gain = this.gains.get(track) ?? 0;
      const next = gain < goal ? Math.min(goal, gain + stride) : Math.max(goal, gain - stride);
      if (next !== gain) moving = true;
      this.gains.set(track, next);
      if (next === 0 && goal === 0) {
        const element = this.loaded.get(track)!;
        element.pause();
        element.currentTime = 0;
      }
    }
    this.apply();
    if (!moving && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private apply(): void {
    for (const [track, element] of this.loaded) {
      element.volume = this.volume * MUSIC_LEVEL[track] * (this.gains.get(track) ?? 0);
    }
  }
}
