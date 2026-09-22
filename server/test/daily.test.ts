import { DAILY_QUESTS, dailyDay } from "../../src/game/account/quests";
import { enterAs, errorOf, makeCharacter } from "./helpers";
import { updateActive } from "../src/store";

describe("daily quests", () => {
  test("a finished one pays once a day, from anywhere", async (server) => {
    await makeCharacter(server, "test-a", "일일왕");
    await enterAs(server, "test-a");
    const quest = DAILY_QUESTS[0];
    expect(await errorOf(server.claimDaily(quest.id))).toContain("quest_unfinished");
    const today = dailyDay(Date.now());
    await updateActive("test-a", (c) => ({ ...c, daily: { day: today, counts: { [quest.id]: quest.count }, claimed: [] } }));
    const bag = await server.claimDaily(quest.id);
    expect(bag.gold).toBe(quest.gold);
    for (const item of quest.items) expect(bag.bag[item.id]).toBe(item.n);
    expect(bag.daily.claimed).toContain(quest.id);
    expect(await errorOf(server.claimDaily(quest.id))).toContain("quest_unfinished");
    expect(await errorOf(server.claimDaily("nope"))).toContain("unavailable");
    // Yesterday's finished one is gone by today.
    await updateActive("test-a", (c) => ({ ...c, daily: { day: "2000-01-01", counts: { forest2: 99 }, claimed: [] } }));
    expect(await errorOf(server.claimDaily("forest2"))).toContain("quest_unfinished");
  });
});
