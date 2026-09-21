import { afterEach, describe, expect, it, vi } from "vitest";
import { RUINS, TILE_SIZE, parseLevel } from "../../src/game/rules/levelLayout";
import { HIGH_H } from "../../src/game/rules/platforms";
import { PRACTICE_ACCOUNT, PracticeSession } from "../../src/net/practice";

const layout = parseLevel(RUINS, TILE_SIZE);
const DT = 0.1;
// Standing on a high block, out of a zombie's reach, keeps the idle player alive while the bots move.
const block = layout.platforms.find((p) => p.h === HIGH_H)!;
const SAFE = { x: block.x, z: block.z, yaw: 0, y: HIGH_H };

afterEach(() => {
  vi.useRealTimers();
});

async function run(session: PracticeSession, seconds: number, pose = SAFE): Promise<void> {
  for (let t = 0; t < seconds; t += DT) {
    vi.advanceTimersByTime(DT * 1000);
    session.human.reportPose(pose);
    session.update(DT, pose);
    await session.world.idle();
    await Promise.resolve();
  }
}

describe("practice bots leave the objectives to you", () => {
  it("never picks up a key or opens the gate", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout);
    await session.start();
    await run(session, 120);
    const match = session.human.state.match!;
    session.dispose();
    expect(match.objectives.shards.some(Boolean)).toBe(false);
    expect(match.objectives.stage).toBe("shards");
  });

  it("lights the other candle only after you light yours", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout);
    await session.start();
    await session.human.setStage("devices");
    // Long enough for the bots to reach the candles and wait there.
    await run(session, 120);
    const lit = (until: number) => until > session.human.serverNow();
    expect(session.human.state.match!.objectives.devices.some(lit)).toBe(false);

    const device = { x: layout.devices[0].x, z: layout.devices[0].z, yaw: 0, y: 0 };
    // Walk over and let a pose or two reach the server before pressing E.
    await run(session, 1, device);
    expect(await session.human.interact()).toBeNull();
    await run(session, 20, device);
    const match = session.human.state.match!;
    session.dispose();
    // The player's candle brought a bot to the other one, so the door opened.
    expect(match.objectives.stage).toBe("seal");
  });

  it("waits at the exit until you are out", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const session = new PracticeSession(layout);
    await session.start();
    await session.human.setStage("exit");
    await run(session, 150);
    const match = session.human.state.match!;
    session.dispose();
    expect(match.phase).toBe("playing");
    expect(match.escaped).toEqual([]);
    expect(match.dead).not.toContain(PRACTICE_ACCOUNT);
  });
});
