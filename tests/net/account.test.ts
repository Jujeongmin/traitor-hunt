import { describe, expect, it } from "vitest";
import { Server } from "../../server/src/server";
import {
  createCharacter, loadAccount, loadRanking, nameFree, nicknameProblem, saveWorld, selectCharacter,
} from "../../src/net/account";
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
  it("has no character until one is made", async () => {
    const [a] = seats("test-a");
    expect(await loadAccount(a)).toMatchObject({ account: "test-a", characters: [], active: null });
    const view = await createCharacter(a, "유적왕", "rogue", "0000");
    expect(view.active).toMatchObject({ name: "유적왕", playerClass: "rogue" });
    expect(await loadAccount(a)).toMatchObject({ nickname: "유적왕" });
  });

  it("switches between its characters", async () => {
    const [a] = seats("test-a");
    const first = await createCharacter(a, "하나", "warrior", "0000");
    await createCharacter(a, "둘째", "cleric", "0000");
    expect((await selectCharacter(a, first.active!.id)).active?.name).toBe("하나");
  });

  it("reads an empty board for a new account", async () => {
    const [a] = seats("test-a");
    const view = await loadRanking(a);
    expect(view.xp).toBe(0);
    expect(view.rank).toBeNull();
    expect(view.board).toEqual([]);
  });

  it("checks names before a character is made, and explains problems in Korean", async () => {
    const [a, b] = seats("test-a", "test-b");
    await createCharacter(a, "Hunter", "warrior", "0000");
    expect(await nameFree(b, "hunter")).toBe(false);
    expect(await nameFree(b, "Seeker")).toBe(true);
    expect(nicknameProblem(await failure(createCharacter(b, "HUNTER", "warrior", "0000")))).toBe("이미 쓰고 있는 이름이에요");
    expect(nicknameProblem(await failure(createCharacter(b, "봇 1", "warrior", "0000")))).toBe("한글·영문·숫자·_ 로 2~12자까지 쓸 수 있어요");
  });
});

describe("server pick", () => {
  it("is empty until picked and then remembered", async () => {
    const [a] = seats("test-a");
    expect((await loadAccount(a)).world).toBeNull();
    expect((await saveWorld(a, "w2")).world).toBe("w2");
    expect((await loadAccount(a)).world).toBe("w2");
  });
});
