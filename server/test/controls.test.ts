import { errorOf, makeCharacter } from "./helpers";

describe("controls", () => {
  test("the bar's set-up is kept on the account, and only a well-formed one", async (server) => {
    await makeCharacter(server, "test-a", "설정왕");
    expect(await server.getControls()).toBeNull();
    const controls = { hotbars: { warrior: [2, 0, null] }, autoSkills: [true, true, false], autoPotion: false };
    await server.saveControls(controls);
    expect(await server.getControls()).toEqual(controls);

    expect(await errorOf(server.saveControls({ ...controls, hotbars: { warrior: [9, null, null] } }))).toContain("unavailable");
    expect(await errorOf(server.saveControls({ ...controls, hotbars: { dragon: [0, null, null] } }))).toContain("unavailable");
    expect(await errorOf(server.saveControls({ ...controls, autoSkills: [true] }))).toContain("unavailable");
    expect(await errorOf(server.saveControls("x"))).toContain("unavailable");
    expect(await server.getControls()).toEqual(controls);
  });
});
