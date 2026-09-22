import { errorOf, makeCharacter } from "./helpers";

describe("controls", () => {
  test("the bar's set-up is kept on the account, and only a well-formed one", async (server) => {
    await makeCharacter(server, "test-a", "설정왕");
    expect(await server.getControls()).toBeNull();
    const controls = { hotbars: { warrior: [2, 0, null] }, autoSkills: [true, true, false], autoPotion: false, potionAt: 50 };
    await server.saveControls(controls);
    expect(await server.getControls()).toEqual(controls);
    // A threshold out of range is brought into it; one from before it was kept gets the starting one.
    await server.saveControls({ ...controls, potionAt: 3 });
    expect((await server.getControls()).potionAt).toBe(10);
    const { potionAt: _, ...old } = controls;
    await server.saveControls(old);
    expect((await server.getControls()).potionAt).toBe(35);
    await server.saveControls(controls);

    expect(await errorOf(server.saveControls({ ...controls, hotbars: { warrior: [9, null, null] } }))).toContain("unavailable");
    expect(await errorOf(server.saveControls({ ...controls, hotbars: { dragon: [0, null, null] } }))).toContain("unavailable");
    expect(await errorOf(server.saveControls({ ...controls, autoSkills: [true] }))).toContain("unavailable");
    expect(await errorOf(server.saveControls("x"))).toContain("unavailable");
    expect(await server.getControls()).toEqual(controls);
  });
});
