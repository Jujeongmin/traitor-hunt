import { FIRST_LEVEL_XP, levelOf } from "../../src/game/account/level";
import { giveXp, makeCharacter } from "./helpers";

describe("character level", () => {
  test("a new character is level 1 with nothing earned", async (server) => {
    const view = await makeCharacter(server, "test-a", "새싹");
    expect(view.level).toEqual({ level: 1, into: 0, need: FIRST_LEVEL_XP });
    expect(view.xp).toBe(0);
  });

  test("comes from the XP saved on the character", async (server) => {
    await makeCharacter(server, "test-a", "새싹");
    await giveXp("test-a", 200);
    const view = await server.getAccount();
    expect(view.xp).toBe(200);
    expect(view.level).toEqual(levelOf(200));
    expect(view.active.level).toEqual(levelOf(200));
  });
});
