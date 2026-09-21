import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGES } from "../../src/game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { PracticeSession } from "../../src/net/practice";

const layout = parseLevel(RUINS, TILE_SIZE);
const DT = 0.1;

afterEach(() => {
  vi.useRealTimers();
});

async function runUntilEnd(session: PracticeSession, maxSeconds: number): Promise<number> {
  for (let t = 0; t < maxSeconds; t += DT) {
    vi.advanceTimersByTime(DT * 1000);
    session.update(DT, null);
    await session.world.idle();
    await Promise.resolve();
    if (session.human.state.phase === "ended") return t;
  }
  return Number.POSITIVE_INFINITY;
}

describe("practice session", () => {
  it("fills a room with the player and three bots", async () => {
    const session = new PracticeSession(layout);
    await session.start();
    const match = session.human.state.match!;
    expect(match.players).toEqual(["test-you", "test-bot-1", "test-bot-2", "test-bot-3"]);
    expect(session.human.state.phase).toBe("playing");
    expect(session.human.state.you.role).not.toBeNull();
    session.dispose();
  });

  it("seats you with the class and costume you picked", async () => {
    const session = new PracticeSession(layout, { playerClass: "guardian", costume: "111111110000" });
    await session.start();
    expect(session.human.state.match!.classes["test-you"]).toBe("guardian");
    expect(session.human.state.match!.looks["test-you"]).toBe("111111110000");
    session.dispose();
  });

  it("plays a whole match with bots on every seat and gets through the objectives", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout, { autopilot: true });
    await session.start();
    const endedAt = await runUntilEnd(session, 21 * 60);
    session.dispose();

    expect(endedAt).toBeLessThan(21 * 60);
    const match = session.human.state.match!;
    expect(match.phase).toBe("ended");
    expect(match.results).toHaveLength(4);
    expect(STAGES.indexOf(match.objectives.stage)).toBeGreaterThanOrEqual(2);
    console.log(`bot match: ${match.result!.reason} after ${Math.round(endedAt)}s at stage ${match.objectives.stage}`);
  }, 240_000);
});
