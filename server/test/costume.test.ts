import { COSTUMES } from "../../src/game/render/costumes";
import { PLAYERS, actAs, errorOf, fillRoom, roomMatch } from "./helpers";

describe("names in a match", () => {
  test("the lobby carries each player nickname, so the matching screen can show it", async (server) => {
    server.connect({ account: PLAYERS[0] });
    await server.setNickname("유적왕");
    const roomId = await fillRoom(server);
    const match = await roomMatch(roomId);
    expect(match.names[PLAYERS[0]]).toBe("유적왕");
    expect(match.names[PLAYERS[1]] ?? null).toBeNull();
  });
});

describe("classes in a match", () => {
  test("the lobby carries the class each player picked; the rest take their seat class", async (server) => {
    server.connect({ account: PLAYERS[0] });
    await server.setClass("guardian");
    const roomId = await fillRoom(server);
    const match = await roomMatch(roomId);
    expect(match.classes[PLAYERS[0]]).toBe("guardian");
    expect(match.classes[PLAYERS[1]] ?? null).toBeNull();
  });

  test("takes only classes it knows, and the account remembers it", async (server) => {
    server.connect({ account: PLAYERS[0] });
    expect(await errorOf(server.setClass("archer"))).toContain("unavailable");
    await server.setClass("striker");
    expect((await $global.getUserState(PLAYERS[0])).playerClass).toBe("striker");
  });
});

describe("costumes in a match", () => {
  test("the match carries what each player picked, so everyone sees the same look", async (server) => {
    server.connect({ account: PLAYERS[0] });
    await server.setCostume("11111111");
    const roomId = await fillRoom(server);
    const match = await roomMatch(roomId);
    expect(match.looks[PLAYERS[0]]).toBe("11111111");
    // The others never picked one, so the match leaves them to their seat costume.
    expect(match.looks[PLAYERS[1]] ?? null).toBeNull();
  });

  test("a later change does not rewrite a match already under way", async (server) => {
    const roomId = await fillRoom(server);
    actAs(server, PLAYERS[0], roomId);
    await server.setCostume("11111111");
    expect((await roomMatch(roomId)).looks[PLAYERS[0]] ?? null).toBeNull();
  });

  test("takes only costumes it knows", async (server) => {
    server.connect({ account: PLAYERS[0] });
    expect(await errorOf(server.setCostume("golden-armour"))).toContain("unavailable");
  });
});
