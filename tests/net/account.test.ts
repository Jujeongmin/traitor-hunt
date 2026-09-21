import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import { FIRST_LEVEL_XP } from "../../src/game/account/level";
import { loadAccount, loadStats, nicknameProblem, saveNickname } from "../../src/net/account";
import { LocalWorld } from "../../src/net/local/localWorld";
import { LocalTransport } from "../../src/net/localTransport";

function seats(...accounts: string[]): LocalTransport[] {
  const world = new LocalWorld(new Server());
  return accounts.map((account) => new LocalTransport(world, account));
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("account", () => {
  it("has no nickname until one is saved", async () => {
    const [a] = seats("test-a");
    expect(await loadAccount(a)).toMatchObject({ account: "test-a", nickname: null });
    expect(await saveNickname(a, "유적왕")).toMatchObject({ account: "test-a", nickname: "유적왕" });
    expect(await loadAccount(a)).toMatchObject({ account: "test-a", nickname: "유적왕" });
  });

  it("starts at level 1 and carries the level through a rename", async () => {
    const [a] = seats("test-a");
    expect(await loadAccount(a)).toMatchObject({ xp: 0, level: { level: 1, into: 0, need: FIRST_LEVEL_XP } });
    expect(await saveNickname(a, "등반가")).toMatchObject({ xp: 0, level: { level: 1 } });
  });

  it("reads an empty record and an empty board for a new account", async () => {
    const [a] = seats("test-a");
    const stats = await loadStats(a);
    expect(stats.profile.games).toBe(0);
    expect(stats.rank).toBeNull();
    expect(stats.board).toEqual([]);
  });

  it("lets two players hold different names", async () => {
    const [a, b] = seats("test-a", "test-b");
    await saveNickname(a, "Hunter");
    expect(await saveNickname(b, "Seeker")).toMatchObject({ account: "test-b", nickname: "Seeker" });
  });

  it("frees a name when its owner renames", async () => {
    const [a, b] = seats("test-a", "test-b");
    await saveNickname(a, "Hunter");
    await saveNickname(a, "Seeker");
    expect(await saveNickname(b, "hunter")).toMatchObject({ account: "test-b", nickname: "hunter" });
  });

  it("explains a taken or invalid name in Korean", async () => {
    const [a, b] = seats("test-a", "test-b");
    await saveNickname(a, "Hunter");
    expect(nicknameProblem(await failure(saveNickname(b, "HUNTER")))).toBe("이미 쓰고 있는 닉네임이에요");
    expect(nicknameProblem(await failure(saveNickname(b, "봇 1")))).toBe("한글·영문·숫자·_ 로 2~12자까지 쓸 수 있어요");
    expect(nicknameProblem(new Error("socket closed"))).toBe("저장하지 못했어요. 잠시 뒤 다시 시도해 주세요");
  });
});
