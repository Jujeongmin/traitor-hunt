import type { AccountView } from "../game/account/nickname";
import type { RankingView } from "../game/account/ranking";
import { errorCode } from "./errors";
import type { MatchTransport } from "./transport";

const PROBLEMS: Record<string, string> = {
  nickname_taken: "이미 쓰고 있는 닉네임이에요",
  nickname_invalid: "한글·영문·숫자·_ 로 2~12자까지 쓸 수 있어요",
};

export function loadAccount(transport: MatchTransport): Promise<AccountView> {
  return transport.call<AccountView>("getAccount");
}

export function saveNickname(transport: MatchTransport, nickname: string): Promise<AccountView> {
  return transport.call<AccountView>("setNickname", [nickname]);
}

export function saveWorld(transport: MatchTransport, world: string): Promise<AccountView> {
  return transport.call<AccountView>("setWorld", [world]);
}

// What to show under the nickname field when saving fails.
export function nicknameProblem(error: unknown): string {
  return PROBLEMS[errorCode(error)] ?? "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요";
}

export function loadRanking(transport: MatchTransport): Promise<RankingView> {
  return transport.call<RankingView>("getRanking");
}
