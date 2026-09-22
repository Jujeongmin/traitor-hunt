import { CHAT_BURST, CHAT_GAP_MS, CHAT_MAX } from "../../src/game/world/chat";
import { enterAs, errorOf, makeCharacter } from "./helpers";

describe("chat", () => {
  test("a line goes out tidied, with the name the room shows", async (server) => {
    await makeCharacter(server, "test-a", "수다쟁이");
    await enterAs(server, "test-a");
    const said = await server.say("  안녕   하세요\n");
    expect(said).toMatchObject({ account: "test-a", name: "수다쟁이", text: "안녕 하세요" });
    await $room.updateMyState({ chatAt: [] });
    expect(await errorOf(server.say("   "))).toContain("unavailable");
    expect(await errorOf(server.say("가".repeat(CHAT_MAX + 1)))).toContain("unavailable");
    expect(await errorOf(server.say(42))).toContain("unavailable");
  });

  test("lines too close together, or too many at once, are turned away", async (server) => {
    await makeCharacter(server, "test-a", "도배꾼");
    await enterAs(server, "test-a");
    await server.say("하나");
    expect(await errorOf(server.say("둘"))).toContain("too_fast");
    // Spaced out, but a burst's worth already in the window.
    const now = Date.now();
    await $room.updateMyState({ chatAt: Array.from({ length: CHAT_BURST }, (_, i) => now - CHAT_GAP_MS * (i + 1)) });
    expect(await errorOf(server.say("셋"))).toContain("too_fast");
    await $room.updateMyState({ chatAt: [now - CHAT_GAP_MS] });
    expect((await server.say("넷")).text).toBe("넷");
  });
});
