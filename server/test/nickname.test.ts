import { errorOf } from "./helpers";

describe("nicknames", () => {
  test("a new account has none until it picks one", async (server) => {
    server.connect({ account: "test-a" });
    expect(await server.getAccount()).toMatchObject({ account: "test-a", nickname: null });
    expect(await server.setNickname("  유적왕 ")).toMatchObject({ account: "test-a", nickname: "유적왕" });
    expect(await server.getAccount()).toMatchObject({ account: "test-a", nickname: "유적왕" });
  });

  test("belongs to one account, ignoring case", async (server) => {
    server.connect({ account: "test-a" });
    await server.setNickname("Hunter");
    server.connect({ account: "test-b" });
    expect(await errorOf(server.setNickname("hunter"))).toContain("nickname_taken");
    expect(await server.getAccount()).toMatchObject({ account: "test-b", nickname: null });
  });

  test("the owner can change the case of their own name", async (server) => {
    server.connect({ account: "test-a" });
    await server.setNickname("hunter");
    expect(await server.setNickname("HUNTER")).toMatchObject({ account: "test-a", nickname: "HUNTER" });
  });

  test("renaming frees the old name for someone else", async (server) => {
    server.connect({ account: "test-a" });
    await server.setNickname("Hunter");
    await server.setNickname("Seeker");
    server.connect({ account: "test-b" });
    expect(await server.setNickname("Hunter")).toMatchObject({ account: "test-b", nickname: "Hunter" });
    expect(await errorOf(server.setNickname("seeker"))).toContain("nickname_taken");
  });

  test("rejects a name the rules do not allow", async (server) => {
    server.connect({ account: "test-a" });
    expect(await errorOf(server.setNickname("봇 1"))).toContain("nickname_invalid");
    expect(await errorOf(server.setNickname({ name: "x" }))).toContain("nickname_invalid");
  });
});
