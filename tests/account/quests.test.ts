import { describe, expect, it } from "vitest";
import { QUESTS, countKills, questDone, readQuest } from "../../src/game/account/quests";
import { CLASSES } from "../../src/game/combat/classes";
import { JOBS, jobsOf } from "../../src/game/combat/jobs";
import { SKILLS } from "../../src/game/combat/skills";

describe("quests", () => {
  it("count only the asked kinds, up to the goal", () => {
    const first = QUESTS[0];
    let p = countKills({ index: 0, count: 0 }, ["rat", first.targets[0]]);
    expect(p.count).toBe(1);
    p = countKills(p, Array(20).fill(first.targets[0]));
    expect(p.count).toBe(first.count);
    expect(questDone(p)).toBe(true);
  });

  it("read back safely, and stay done past the last", () => {
    expect(readQuest(undefined)).toEqual({ index: 0, count: 0 });
    expect(readQuest({ index: 0, count: 999 })).toEqual({ index: 0, count: QUESTS[0].count });
    expect(readQuest({ index: 99, count: 3 })).toEqual({ index: QUESTS.length, count: 0 });
    expect(questDone({ index: QUESTS.length, count: 0 })).toBe(false);
  });
});

describe("growth tables", () => {
  it("every class has three skills opening in order, and two paths to advance", () => {
    for (const c of CLASSES) {
      expect(SKILLS[c].map((s) => s.level)).toEqual([1, 5, 10]);
      expect(jobsOf(c)).toHaveLength(2);
      for (const id of jobsOf(c)) expect(JOBS[id].playerClass).toBe(c);
    }
  });
});
