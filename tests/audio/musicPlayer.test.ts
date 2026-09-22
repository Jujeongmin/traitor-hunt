import { afterEach, describe, expect, it, vi } from "vitest";
import { CROSSFADE_MS, MusicPlayer, type MusicElement } from "../../src/game/audio/MusicPlayer";
import { MUSIC_LEVEL } from "../../src/game/audio/musicTrack";

class FakeAudio implements MusicElement {
  volume = 1;
  loop = false;
  currentTime = 0;
  plays = 0;
  pauses = 0;
  playing = false;
  constructor(readonly src: string, private readonly refuse = false) {}
  play(): Promise<void> {
    this.plays += 1;
    if (this.refuse) return Promise.reject(new Error("blocked"));
    this.playing = true;
    return Promise.resolve();
  }
  pause(): void {
    this.pauses += 1;
    this.playing = false;
  }
}

function setup(refuse = false) {
  const made: FakeAudio[] = [];
  const touches: (() => void)[] = [];
  const player = new MusicPlayer(
    (src) => {
      const audio = new FakeAudio(src, refuse);
      made.push(audio);
      return audio;
    },
    (again) => touches.push(again),
  );
  return { player, made, touch: () => touches.pop()?.() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("MusicPlayer", () => {
  it("fades the new track in and the old one out, then stops the old one", async () => {
    vi.useFakeTimers();
    const { player, made } = setup();
    player.setVolume(1);
    player.play("menu");
    vi.advanceTimersByTime(CROSSFADE_MS);
    const menu = made[0];
    expect(menu.src).toContain("menu.ogg");
    expect(menu.loop).toBe(true);
    // Full volume setting: each piece at its own level (see MUSIC_LEVEL).
    expect(menu.volume).toBeCloseTo(MUSIC_LEVEL.menu);

    player.play("boss");
    vi.advanceTimersByTime(CROSSFADE_MS / 2);
    const boss = made[1];
    expect(menu.volume).toBeGreaterThan(0);
    expect(menu.volume).toBeLessThan(MUSIC_LEVEL.menu);
    expect(boss.volume).toBeGreaterThan(0);

    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(boss.volume).toBeCloseTo(MUSIC_LEVEL.boss);
    expect(menu.volume).toBe(0);
    expect(menu.playing).toBe(false);
    player.dispose();
  });

  it("scales every track by the volume setting and starts nothing at zero", () => {
    vi.useFakeTimers();
    const { player, made } = setup();
    player.setVolume(0);
    player.play("field");
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(made).toHaveLength(0);

    player.setVolume(0.4);
    vi.advanceTimersByTime(CROSSFADE_MS);
    expect(made[0].volume).toBeCloseTo(0.4 * MUSIC_LEVEL.field);
    player.setVolume(0.2);
    expect(made[0].volume).toBeCloseTo(0.2 * MUSIC_LEVEL.field);
    player.dispose();
  });

  it("tries again on the first touch when the browser refuses to start", async () => {
    vi.useFakeTimers();
    const { player, made, touch } = setup(true);
    player.setVolume(1);
    player.play("menu");
    await Promise.resolve();
    await Promise.resolve();
    expect(made[0].plays).toBe(1);
    touch();
    expect(made[0].plays).toBe(2);
    player.dispose();
  });

  it("stops everything when it is thrown away", () => {
    vi.useFakeTimers();
    const { player, made } = setup();
    player.setVolume(1);
    player.play("deep");
    vi.advanceTimersByTime(CROSSFADE_MS);
    player.dispose();
    expect(made[0].pauses).toBeGreaterThan(0);
    player.play("boss");
    expect(made).toHaveLength(1);
  });
});
