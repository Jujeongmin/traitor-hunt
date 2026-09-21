import { useEffect, useState } from "react";
import { MATCH_PLAYERS } from "../game/match/constants";
import { botFillInMs } from "../game/match/lifecycle";
import type { ClientState } from "../net/matchClient";
import { displayName } from "../game/render/names";

export interface MatchmakingPanelProps {
  // Null until the seat is taken; the panel then follows the lobby.
  state: ClientState | null;
  account: string;
  serverNow: () => number;
  startedAt: number;
  onCancel: () => void;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const JOIN_ERROR: Record<string, string> = {
  party_busy: "파티원이 아직 게임 중이에요",
  not_leader: "파티장만 빠른 시작을 할 수 있어요",
  unavailable: "들어갈 수 있는 방이 없어요",
  not_owned: "온라인 대전은 정식판을 구매해야 할 수 있어요",
};

// Stays on the menu while the lobby fills: how long you have waited, who is in, and a way out.
export function MatchmakingPanel({ state, account, serverNow, startedAt, onCancel }: MatchmakingPanelProps) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => redraw((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, []);

  const match = state?.match ?? null;
  const players = match?.players ?? [];
  const fillInMs = match ? botFillInMs(match, serverNow()) : null;
  const failed = state?.phase === "error";

  return (
    <div className="dark-panel matchmaking band">
      <div className="matchmaking-head">
        <b>{failed ? "매칭 실패" : "매칭 중"}</b>
        {!failed && <span className="matchmaking-clock">{clock(Date.now() - startedAt)}</span>}
        <span className="note">{players.length}/{MATCH_PLAYERS}</span>
      </div>
      {failed ? (
        <p className="note">{JOIN_ERROR[state?.error ?? ""] ?? state?.error ?? "잠시 뒤 다시 시도해 주세요"}</p>
      ) : (
        <ol className="matchmaking-seats">
          {Array.from({ length: MATCH_PLAYERS }, (_, i) => {
            const seat = players[i];
            const name = seat ? (match?.names[seat] ?? displayName(seat, account)) : null;
            return (
              <li key={i} className={seat === account ? "me" : seat ? "taken" : "empty"}>
                {name ?? "기다리는 중…"}
              </li>
            );
          })}
        </ol>
      )}
      {!failed && fillInMs !== null && (
        <p className="note">{Math.ceil(fillInMs / 1000)}초 뒤 남은 자리를 봇이 채웁니다</p>
      )}
      <button type="button" className="text-button" onClick={onCancel}>{failed ? "닫기" : "매칭 취소"}</button>
    </div>
  );
}
