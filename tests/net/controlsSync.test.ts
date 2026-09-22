import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "../../server/src/server";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";
import { CONTROLS_SAVE_MS, syncControls } from "../../src/net/controlsSync";
import { DEFAULT_SETTINGS, setHotbarSlot, settings, updateSettings } from "../../src/ui/settings";

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("syncControls", () => {
  afterEach(() => {
    vi.useRealTimers();
    updateSettings(DEFAULT_SETTINGS);
  });

  it("takes this browser's bar to an account without one, then the account's to another browser", async () => {
    const world = new LocalWorld(new Server());
    const first = new LocalTransport(world, "test-a");
    updateSettings({ hotbars: { warrior: [1, 0, null] }, autoPotion: false });
    const stop = syncControls(first);
    await settle();
    stop();
    expect(await first.call("getControls")).toMatchObject({ hotbars: { warrior: [1, 0, null] }, autoPotion: false });

    // Another device, set up otherwise, gets the account's.
    updateSettings(DEFAULT_SETTINGS);
    const stopAgain = syncControls(new LocalTransport(world, "test-a"));
    await settle();
    expect(settings().hotbars.warrior).toEqual([1, 0, null]);
    expect(settings().autoPotion).toBe(false);
    stopAgain();
  });

  it("saves a change a moment after the last one", async () => {
    const world = new LocalWorld(new Server());
    const transport = new LocalTransport(world, "test-a");
    await transport.call("saveControls", [{ hotbars: {}, autoSkills: [true, false, false], autoPotion: true }]);
    const stop = syncControls(transport);
    await settle();
    vi.useFakeTimers();
    setHotbarSlot("warrior", 1, 2);
    setHotbarSlot("warrior", 2, 1);
    await vi.advanceTimersByTimeAsync(CONTROLS_SAVE_MS);
    vi.useRealTimers();
    await settle();
    expect(await transport.call("getControls")).toMatchObject({ hotbars: { warrior: [0, 2, 1] } });
    stop();
  });
});
