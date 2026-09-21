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
});
