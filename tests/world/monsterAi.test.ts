import { describe, expect, it } from "vitest";
import { LEASH, stepMonsters } from "../../src/game/world/monsterAi";
import { MONSTERS, spawnMonsters, type MonsterState } from "../../src/game/world/monsters";
import { zoneLayout } from "../../src/game/world/zones";

const layout = zoneLayout("forest1");
const home = layout.playerSpawn;

function rat(x: number, z: number, extra: Partial<MonsterState> = {}): MonsterState {
  return {
    type: "rat", x, z, yaw: 0, hp: MONSTERS.rat.hp, alive: true, stunnedUntil: 0, attackReadyAt: 0, respawnAt: 0,
    homeX: x, homeZ: z, ...extra,
  };
}

describe("monsters", () => {
  it("every hunting field has some, the village none", () => {
    expect(Object.keys(spawnMonsters("forest1")).length).toBeGreaterThan(0);
    expect(Object.keys(spawnMonsters("forest2")).length).toBeGreaterThan(0);
    expect(spawnMonsters("village")).toEqual({});
  });

  it("walk toward a player they can see and bite once close", () => {
    const monsters = { m: rat(home.x, home.z - 5) };
    const prey = [{ account: "a", x: home.x, z: home.z }];
    stepMonsters(monsters, prey, layout, 0.5, 1000);
    expect(monsters.m.z).toBeGreaterThan(home.z - 5);
    let hits: ReturnType<typeof stepMonsters> = [];
    for (let t = 1; t < 20 && hits.length === 0; t++) hits = stepMonsters(monsters, prey, layout, 0.5, 1000 + t * 500);
    expect(hits).toEqual([{ monsterId: "m", account: "a", damage: MONSTERS.rat.damage }]);
  });

  it("ignore players out of sight, and stand still while stunned", () => {
    const monsters = { m: rat(home.x, home.z - 5, { stunnedUntil: 5000 }) };
    stepMonsters(monsters, [{ account: "a", x: home.x, z: home.z }], layout, 0.5, 1000);
    expect(monsters.m.z).toBe(home.z - 5);
    const far = { m: rat(home.x, home.z - 5) };
    stepMonsters(far, [{ account: "a", x: home.x + 30, z: home.z }], layout, 0.5, 1000);
    expect(far.m.x).toBe(home.x);
  });

  it("give up past the leash and go home", () => {
    const monsters = { m: rat(home.x, home.z, { homeX: home.x, homeZ: home.z - LEASH - 2, hp: 5 }) };
    stepMonsters(monsters, [{ account: "a", x: home.x, z: home.z + 1 }], layout, 0.5, 1000);
    expect(monsters.m.z).toBeLessThan(home.z);
  });
});
