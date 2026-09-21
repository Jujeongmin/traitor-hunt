import { errorOf } from "./helpers";

describe("picking a server", () => {
  test("a new account has none, and picking one is remembered", async (server) => {
    server.connect({ account: "test-a" });
    expect((await server.getAccount()).world).toBeNull();
    expect((await server.setWorld("w3")).world).toBe("w3");
    expect((await server.getAccount()).world).toBe("w3");
  });

  test("turns away servers that do not exist", async (server) => {
    server.connect({ account: "test-a" });
    expect(await errorOf(server.setWorld("w9"))).toContain("unavailable");
    expect(await errorOf(server.setWorld(2))).toContain("unavailable");
  });

  test("matchmaking only seats players on the same server together", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w1");
    const first = (await server.findMatch()).roomId;

    server.connect({ account: "test-b" });
    await server.setWorld("w2");
    const second = (await server.findMatch()).roomId;
    expect(second === first).toBe(false);

    server.connect({ account: "test-c" });
    await server.setWorld("w1");
    expect((await server.findMatch()).roomId).toBe(first);
  });

  test("an account that never picked plays on the first server", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w1");
    const first = (await server.findMatch()).roomId;
    server.connect({ account: "test-b" });
    expect((await server.findMatch()).roomId).toBe(first);
  });
});
