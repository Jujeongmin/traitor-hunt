import { describe, expect, it } from "vitest";
import { GROUNDED, stepJump } from "../../src/game/rules/movement";
import { HIGH_H, LOW_H, groundAt, platformsFor, type Platform } from "../../src/game/rules/platforms";
import { RUINS, TILE_SIZE, parseLevel, solidWith } from "../../src/game/rules/levelLayout";

const crate: Platform = { x: 10, z: 10, w: 1.4, d: 1.4, h: LOW_H, model: "dd_crate_a" };

describe("platformsFor", () => {
  it("puts a low crate in a c cell and a low step beside a high block in an H cell", () => {
    expect(platformsFor("c", 10, 10).map((p) => p.h)).toEqual([LOW_H]);
    const steps = platformsFor("H", 10, 10);
    expect(steps.map((p) => p.h).sort()).toEqual([LOW_H, HIGH_H]);
    expect(platformsFor(".", 10, 10)).toEqual([]);
  });
});

describe("groundAt", () => {
  it("is the top of any platform under the body, else the floor", () => {
    expect(groundAt([crate], 10, 10, 0.35)).toBe(LOW_H);
    expect(groundAt([crate], 10.9, 10, 0.35)).toBe(LOW_H); // standing on the edge
    expect(groundAt([crate], 11.2, 10, 0.35)).toBe(0);
  });
});

describe("stepJump onto platforms", () => {
  it("lands on the ground it is given and falls when it drops away", () => {
    // Jump from the floor; once the feet clear the top of the crate the body moves over it.
    let s = stepJump({ ...GROUNDED }, true, 1 / 60, 0);
    let over = false;
    for (let i = 0; i < 90; i++) {
      if (s.y > LOW_H + 0.05) over = true;
      s = stepJump(s, false, 1 / 60, over ? LOW_H : 0);
    }
    expect(over).toBe(true);
    expect(s).toEqual({ y: LOW_H, vy: 0 });
    let fall = s;
    for (let i = 0; i < 40; i++) fall = stepJump(fall, false, 1 / 60, 0);
    expect(fall).toEqual(GROUNDED);
  });

  it("jumps from a platform top", () => {
    const up = stepJump({ y: LOW_H, vy: 0 }, true, 1 / 60, LOW_H);
    expect(up.y).toBeGreaterThan(LOW_H);
  });
});

describe("solidWith and platforms", () => {
  const layout = parseLevel(RUINS, TILE_SIZE);
  const p = layout.platforms[0];

  it("blocks feet below a platform's top and lets feet on it pass", () => {
    expect(layout.platforms.length).toBeGreaterThan(0);
    expect(solidWith(layout, [])(p.x, p.z)).toBe(true);
    expect(solidWith(layout, [], p.h)(p.x, p.z)).toBe(false);
  });

  it("ignores platforms for walls-only tests", () => {
    expect(solidWith(layout, [], Infinity)(p.x, p.z)).toBe(false);
  });
});
