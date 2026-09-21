import { describe, expect, it } from "vitest";
import { MUSIC_FILES, trackFor } from "../../src/game/audio/musicTrack";

describe("trackFor", () => {
  it("plays the menu piece off the map and in the village", () => {
    expect(trackFor(null)).toBe("menu");
    expect(trackFor("village")).toBe("menu");
  });

  it("wanders in the fields and turns grim at the boss", () => {
    expect(trackFor("forest1")).toBe("explore");
    expect(trackFor("forest2")).toBe("explore");
    expect(trackFor("boss")).toBe("boss");
  });

  it("points every track at a file", () => {
    for (const file of Object.values(MUSIC_FILES)) expect(file).toMatch(/^assets\/music\/.+\.ogg$/);
  });
});
