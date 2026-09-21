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

  test("an account from before characters keeps its one character and its match XP", async (server) => {
    const profile = { games: 4, wins: 2, escapes: 1, monsterKills: 5 };
    await $global.updateUserState("test-a", { nickname: "옛날사람", playerClass: "striker", costume: "1413", world: "w2", profile });
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.characters).toHaveLength(1);
    // 4 games, 2 wins, 1 escape, 5 monsters by the old rules.
    expect(view.active).toMatchObject({ name: "옛날사람", playerClass: "warrior", costume: "1413", xp: 4 * 10 + 2 * 20 + 10 + 5 * 2 });
    // The old record stays on the account.
    expect((await $global.getUserState("test-a")).profile).toEqual(profile);
  });

  test("a character moved over before its XP was carried gets it once", async (server) => {
    // The first name the account ever took, from before characters.
    await $global.addCollectionItem("nicknames", { key: "옛날사람", name: "옛날사람", account: "test-a" });
    await $global.updateUserState("test-a", {
      profile: { games: 3 }, active: "c-1",
      characters: [{ id: "c-1", world: "w1", name: "옛날사람", playerClass: "monk", costume: "0000", xp: 0, spot: null }],
    });
    server.connect({ account: "test-a" });
    expect((await server.getAccount()).active.xp).toBe(30);
    // Once saved, the old record is not counted again.
    await server.createCharacter("새로운", "cleric", "0000");
    await server.selectCharacter("c-1");
    expect((await server.getAccount()).active.xp).toBe(30);
    expect((await $global.getUserState("test-a")).legacyXpApplied).toBe(true);
  });

  test("making characters one after another keeps every one, in the order made", async (server) => {
    server.connect({ account: "test-a" });
    for (const name of ["첫째", "둘째", "셋째"]) await server.createCharacter(name, "warrior", "0000");
    expect((await server.getAccount()).characters.map((c: any) => c.name)).toEqual(["첫째", "둘째", "셋째"]);
    // Saved keyed by id, not as a bare array.
    const state = await $global.getUserState("test-a");
    expect(Object.keys(state.characterMap)).toHaveLength(3);
  });

  test("characters the first saves left as an array, or as an object keyed by index, still read back", async (server) => {
    const one = { id: "c-1", world: "w1", name: "하나", playerClass: "monk", costume: "0000", xp: 5, spot: null };
    const two = { id: "c-2", world: "w1", name: "두울", playerClass: "rogue", costume: "0000", xp: 0, spot: null };
    await $global.updateUserState("test-a", { characters: { 0: one, 1: two }, active: "c-2" });
    server.connect({ account: "test-a" });
    const view = await server.getAccount();
    expect(view.characters.map((c: any) => c.name).sort()).toEqual(["두울", "하나"]);
    expect(view.active.name).toBe("두울");
    await server.createCharacter("세엣", "cleric", "0000");
    expect((await server.getAccount()).characters).toHaveLength(3);
  });
});
