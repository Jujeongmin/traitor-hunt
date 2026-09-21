import { CHARACTERS_PER_WORLD } from "../../src/game/account/characters";
import { errorOf, makeCharacter } from "./helpers";

describe("characters", () => {
  test("a new account has none, and a new character becomes the one you play", async (server) => {
    server.connect({ account: "test-a" });
    expect(await server.getAccount()).toMatchObject({ characters: [], active: null, nickname: null });
    const view = await server.createCharacter("  유적왕 ", "ranger", "1413");
    expect(view.characters).toHaveLength(1);
    expect(view.active).toMatchObject({ name: "유적왕", playerClass: "ranger", costume: "1413" });
    expect(view.active.level.level).toBe(1);
    expect(view).toMatchObject({ nickname: "유적왕", playerClass: "ranger", costume: "1413" });
  });

  test("a name belongs to one character, ignoring case, across accounts and servers", async (server) => {
    await makeCharacter(server, "test-a", "Hunter");
    server.connect({ account: "test-b" });
    await server.setWorld("w3");
    expect(await errorOf(server.createCharacter("hunter", "warrior", "0000"))).toContain("nickname_taken");
    expect(await server.checkName("HUNTER")).toEqual({ free: false });
    expect(await server.checkName("Seeker")).toEqual({ free: true });
    await makeCharacter(server, "test-a", "Seeker");
    expect(await errorOf(makeCharacter(server, "test-a", "seeker"))).toContain("nickname_taken");
  });

  test("turns away bad names, classes and looks", async (server) => {
    server.connect({ account: "test-a" });
    expect(await errorOf(server.createCharacter("봇 1", "warrior", "0000"))).toContain("nickname_invalid");
    expect(await errorOf(server.checkName({ name: "x" }))).toContain("nickname_invalid");
    expect(await errorOf(server.createCharacter("Hunter", "archer", "0000"))).toContain("unavailable");
    expect(await errorOf(server.createCharacter("Hunter", "warrior", "golden"))).toContain("unavailable");
  });

  test("each server has its own characters, up to the limit", async (server) => {
    server.connect({ account: "test-a" });
    await server.setWorld("w1");
    for (let i = 0; i < CHARACTERS_PER_WORLD; i++) await server.createCharacter(`첫서버${i}`, "monk", "0000");
    expect(await errorOf(server.createCharacter("넘침", "monk", "0000"))).toContain("character_limit");
    const other = await server.setWorld("w2");
    expect(other.characters).toEqual([]);
    expect(other.active).toBeNull();
    expect((await server.createCharacter("둘째서버", "cleric", "0000")).characters).toHaveLength(1);
    const back = await server.setWorld("w1");
    expect(back.characters).toHaveLength(CHARACTERS_PER_WORLD);
    expect(back.active?.name).toMatch(/^첫서버/);
  });

  test("switching characters on a server", async (server) => {
    const first = await makeCharacter(server, "test-a", "하나", "warrior");
    await server.createCharacter("둘째", "wizard", "0000");
    const view = await server.selectCharacter(first.active.id);
    expect(view.active).toMatchObject({ name: "하나", playerClass: "warrior" });
    expect(await errorOf(server.selectCharacter("c-nobody"))).toContain("no_character");
  });

  test("an account from before characters keeps its one character", async (server) => {
    await $global.updateUserState("test-a", { nickname: "옛날사람", playerClass: "striker", costume: "1413", xp: 90, world: "w2" });
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.characters).toHaveLength(1);
    expect(view.active).toMatchObject({ name: "옛날사람", playerClass: "warrior", costume: "1413", xp: 90 });
  });
});
