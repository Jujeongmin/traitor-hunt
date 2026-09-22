import { describe, expect, it } from "vitest";
import { MUSIC_FILES, MUSIC_LEVEL, trackFor } from "../../src/game/audio/musicTrack";

describe("trackFor", () => {
  it("plays the menu's piece off the map and the village's at home", () => {
    expect(trackFor(null)).toBe("menu");
    expect(trackFor("village")).toBe("village");
  });

  it("wanders in the fields, whispers deep in the forest and fights at the boss", () => {
    expect(trackFor("forest1")).toBe("field");
    expect(trackFor("forest2")).toBe("field2");
    expect(trackFor("forest3")).toBe("deep");
    expect(trackFor("boss")).toBe("boss");
  });

  it("points every track at a file, at a level no louder than as recorded", () => {
    for (const file of Object.values(MUSIC_FILES)) expect(file).toMatch(/^assets\/music\/.+\.ogg$/);
    for (const level of Object.values(MUSIC_LEVEL)) expect(level > 0 && level <= 1).toBe(true);
  });
});
