import type { AccountView } from "../game/account/nickname";
import type { RankingView } from "../game/account/ranking";
import { errorCode } from "./errors";
import type { MatchTransport } from "./transport";

const PROBLEMS: Record<string, string> = {
  nickname_taken: "이미 쓰고 있는 이름이에요",
  nickname_invalid: "한글·영문·숫자·_ 로 2~12자까지 쓸 수 있어요",
  character_limit: "이 서버에는 캐릭터를 더 만들 수 없어요",
};

export function loadAccount(transport: MatchTransport): Promise<AccountView> {
  return transport.call<AccountView>("getAccount");
}

export function saveWorld(transport: MatchTransport, world: string): Promise<AccountView> {
  return transport.call<AccountView>("setWorld", [world]);
}

// Whether a name is free for a new character.
export async function nameFree(transport: MatchTransport, name: string): Promise<boolean> {
  return (await transport.call<{ free: boolean }>("checkName", [name])).free;
}

export function createCharacter(transport: MatchTransport, name: string, playerClass: string, costume: string): Promise<AccountView> {
  return transport.call<AccountView>("createCharacter", [name, playerClass, costume]);
}

export function selectCharacter(transport: MatchTransport, id: string): Promise<AccountView> {
  return transport.call<AccountView>("selectCharacter", [id]);
}

// What to show when making a character fails.
export function nicknameProblem(error: unknown): string {
  return PROBLEMS[errorCode(error)] ?? "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요";
}

export function loadRanking(transport: MatchTransport): Promise<RankingView> {
  return transport.call<RankingView>("getRanking");
}
