import { PLAYERS, actAs, errorOf, fillRoom, findTraitor, roomMatch } from "./helpers";

const HOURS = 3 * 3600_000;

describe("matchmaking", () => {
  test("reports the protocol version", async (server) => {
    expect(await server.getServerVersion()).toEqual({ protocol: 8 });
  });

  test("fills one room with four players and starts with exactly one hidden traitor", async (server) => {
    const roomId = await fillRoom(server);
    actAs(server, PLAYERS[0], roomId);
    const snapshot = await server.getMatchState();
    expect(snapshot.roomId).toBe(roomId);
    expect(snapshot.match.phase).toBe("playing");
    expect(snapshot.match.players).toEqual(PLAYERS);
    // The local runner's `.not` recurses forever (gameserver-node 0.1.13), so assert on a boolean.
    expect(JSON.stringify(snapshot.match).includes("traitor")).toBe(false);
    let traitors = 0;
    for (const account of PLAYERS) {
      actAs(server, account, roomId);
      const you = (await server.getMatchState()).you;
      expect(you.hp).toBe(100);
      if (you.role === "traitor") traitors += 1;
    }
    expect(traitors).toBe(1);
  });

  test("puts a fifth player in a new lobby", async (server) => {
    const first = await fillRoom(server);
    server.connect({ account: "test-e" });
    const second = (await server.findMatch()).roomId;
    expect(second === first).toBe(false);
    actAs(server, "test-e", second);
    const snapshot = await server.getMatchState();
    expect(snapshot.match.phase).toBe("lobby");
    expect(snapshot.match.players).toEqual(["test-e"]);
    expect(snapshot.you.role).toBeNull();
  });

  test("gives the same lobby to a player who asks twice", async (server) => {
    server.connect({ account: "test-a" });
    const first = (await server.findMatch()).roomId;
    const again = (await server.findMatch()).roomId;
    expect(again).toBe(first);
    expect((await roomMatch(first)).players).toEqual(["test-a"]);
  });

  test("frees a lobby seat when a player leaves", async (server) => {
    server.connect({ account: "test-a" });
    const roomId = (await server.findMatch()).roomId;
    actAs(server, "test-a", roomId);
    await server.leaveMatch();
    expect((await roomMatch(roomId)).players).toEqual([]);
  });

  test("refuses the test clock for real accounts", async (server) => {
    const roomId = await fillRoom(server);
    server.connect({ account: "0xabc", roomId });
    expect(await errorOf(server.devAdvanceClock(1000))).toContain("unavailable");
  });

  test("refuses room calls from outside a match room", async (server) => {
    server.connect({ account: "test-a", roomId: "nowhere" });
    expect(await errorOf(server.getMatchState())).toContain("unavailable");
  });
});

describe("ending", () => {
  test("gives the traitor the win when no adventurer is left, and records every player once", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    const adventurers = PLAYERS.filter((p) => p !== traitor);
    for (const account of adventurers.slice(1)) {
      actAs(server, account, roomId);
      await server.leaveMatch();
    }
    actAs(server, adventurers[0], roomId);
    await server.devAdvanceClock(HOURS);
    await server.syncMatch();
    expect((await server.getMatchState()).match.phase).toBe("playing");
    await server.leaveMatch();
    actAs(server, traitor, roomId);
    const snapshot = await server.getMatchState();
    expect(snapshot.match.phase).toBe("ended");
    expect(snapshot.match.result).toEqual({ winner: "traitor", reason: "wiped", traitor });
    expect(snapshot.match.results).toHaveLength(4);
    expect(snapshot.match.secretRef).toBeNull();
    expect(await $global.countCollectionItems("match_results")).toBe(4);
    expect((await $global.getUserState(traitor)).profile).toMatchObject({ games: 1, wins: 1, traitorGames: 1, traitorWins: 1 });
    expect((await $global.getUserState(adventurers[0])).profile).toMatchObject({ games: 1, wins: 0, adventurerGames: 1 });
  });

  test("has no time limit, even for $roomTick", async (server) => {
    const roomId = await fillRoom(server);
    const match = await roomMatch(roomId);
    expect(match.endsAt).toBeNull();
    match.devClockOffsetMs = HOURS;
    await $global.updateRoomState(roomId, { match });
    await server.$roomTick(500, roomId);
    expect((await roomMatch(roomId)).phase).toBe("playing");
  });

  test("counts players who leave mid-match as dead; no adventurer left means the traitor wins", async (server) => {
    const roomId = await fillRoom(server);
    const traitor = await findTraitor(server, roomId);
    for (const account of PLAYERS.filter((p) => p !== traitor)) {
      actAs(server, account, roomId);
      await server.leaveMatch();
    }
    const match = await roomMatch(roomId);
    expect(match.phase).toBe("ended");
    expect(match.result.reason).toBe("wiped");
    expect(match.dead).toHaveLength(3);
  });
});
