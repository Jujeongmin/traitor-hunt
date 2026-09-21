import { describe, expect, it } from "vitest";
import { MUSIC_FILES, trackFor } from "../../src/game/audio/musicTrack";
import { createLobby, joinLobby, startMatch } from "../../src/game/match/lifecycle";
import type { PublicMatch } from "../../src/game/match/types";

function playing(): PublicMatch {
  const match = createLobby(0);
  for (const p of ["a", "b", "c", "d"]) joinLobby(match, p);
  startMatch(match, 0, () => 0.6, [{ id: "zombie-0", x: 10, z: 10 }]);
  return match;
}

describe("trackFor", () => {
  it("plays the menu track with no match on", () => {
    expect(trackFor(null, "a")).toBe("menu");
  });

  it("follows the objective: the ruins, then the tension, then the boss", () => {
    const match = playing();
    expect(trackFor(match, "a")).toBe("explore");
    match.objectives.stage = "devices";
    expect(trackFor(match, "a")).toBe("explore");
    match.objectives.stage = "seal";
    expect(trackFor(match, "a")).toBe("tension");
    match.objectives.stage = "boss";
    expect(trackFor(match, "a")).toBe("boss");
    match.objectives.stage = "exit";
    expect(trackFor(match, "a")).toBe("tension");
  });

  it("goes quiet in the lobby and back to the menu track once the match is over", () => {
    const lobby = createLobby(0);
    joinLobby(lobby, "a");
    expect(trackFor(lobby, "a")).toBe("menu");
    const match = playing();
    match.phase = "ended";
    expect(trackFor(match, "a")).toBe("menu");
  });

  it("drops to the menu track for a player who is out of it", () => {
    const match = playing();
    match.objectives.stage = "boss";
    match.dead.push("a");
    expect(trackFor(match, "a")).toBe("menu");
    expect(trackFor(match, "b")).toBe("boss");
  });

  it("names a file for every track", () => {
    for (const track of ["menu", "explore", "tension", "boss"] as const) {
      expect(MUSIC_FILES[track]).toMatch(/^assets\/music\/.+\.ogg$/);
    }
  });
});
