import { useEffect, useRef, useState } from "react";
import type { Pose } from "../game/match/types";
import { MatchView, type HudState } from "../game/render/MatchView";
import type { MatchClient } from "../net/matchClient";
import { displayName } from "../game/render/names";
import { playMusic } from "../game/audio/music";
import { trackFor } from "../game/audio/musicTrack";
import { Hud } from "./Hud";
import { TuningPanel } from "./TuningPanel";

const JOIN_ERROR: Record<string, string> = {
  party_busy: "파티원이 아직 게임 중이에요",
  not_leader: "파티장만 빠른 시작을 할 수 있어요",
  unavailable: "들어갈 수 있는 방이 없어요",
};

export interface MatchScreenProps {
  client: MatchClient;
  onFrame?: (dt: number, pose: Pose | null) => void;
  onExit: () => void;
  // Practice walks the player through each objective.
  tutorial?: boolean;
}

const REASON_LABEL = {
  escaped: "살아남은 모험가가 모두 탈출했습니다",
  wiped: "모험가가 모두 쓰러졌습니다",
  humans_out: "남은 사람이 없어 봇만 남았습니다",
} as const;

export function MatchScreen({ client, onFrame, onExit, tutorial }: MatchScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const view = new MatchView(host.current!, client, {
      onFrame,
      tutorial,
      onProgress: (done, total) => setProgress({ done, total }),
    });
    let cancelled = false;
    const offHud = view.onHud((next) => {
      if (cancelled) return;
      setHud(next);
      setNow(performance.now());
    });
    view
      .start()
      .then(() => !cancelled && setReady(true))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = view.debugHandle();
    return () => {
      cancelled = true;
      offHud();
      view.dispose();
    };
  }, [client, onFrame, tutorial]);

  const result = hud?.result ?? null;
  useEffect(() => {
    if (result && document.pointerLockElement) document.exitPointerLock();
  }, [result]);

  // Dev builds (the editor preview included): the backquote key opens the first-person tuning sliders.
  const [tuning, setTuning] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const toggle = (e: KeyboardEvent) => {
      if (e.code !== "Backquote") return;
      setTuning((open) => {
        if (!open && document.pointerLockElement) document.exitPointerLock();
        return !open;
      });
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);

  // The music follows the objective: the ruins, the tension at the altar, the boss.
  useEffect(() => {
    playMusic(trackFor(hud ? client.state.match : null, client.account));
  }, [client, hud?.objective?.stage, hud?.alive, hud?.escaped, hud?.phase]);

  const me = client.account;
  const mine = hud?.results?.find((r) => r.account === me) ?? null;
  const waiting = hud && (hud.phase === "searching" || hud.phase === "lobby");

  return (
    <div className="app" ref={host}>
      <div className="ui">
      {ready && hud && !result && <Hud hud={hud} now={now} />}
      {tuning && <TuningPanel onClose={() => setTuning(false)} />}
      {!ready && !loadError && (
        <div className="overlay"><span className="band">유적으로 내려가는 중… {progress.done}/{progress.total}</span></div>
      )}
      {loadError && <div className="overlay error"><span className="band">불러오기 실패: {loadError}</span></div>}
      {ready && waiting && <div className="overlay dim"><span className="band">
            플레이어를 기다리는 중 {hud.players}/4
            {hud.botFillInMs !== null && ` · ${Math.ceil(hud.botFillInMs / 1000)}초 뒤 봇이 빈자리를 채웁니다`}
          </span></div>}
      {ready && hud?.phase === "error" && (
        <div className="overlay dim">
          <div className="dark-panel result-panel">
            <h2 className="traitor">연결 오류</h2>
            <p>{JOIN_ERROR[client.state.error ?? ""] ?? client.state.error}</p>
            <button type="button" className="brush-button" onClick={onExit}>처음으로</button>
          </div>
        </div>
      )}
      {result && (
        <div className="overlay dim">
          <div className="dark-panel result-panel">
            <h2 className={result.winner}>{result.winner === "traitor" ? "배신자 승리" : "모험가 승리"}</h2>
            <p>{REASON_LABEL[result.reason]}</p>
            {mine && <p>당신은 {mine.role === "traitor" ? "배신자" : "모험가"} — {mine.won ? "승리" : "패배"}</p>}
            <p>배신자: {result.traitor === me ? "당신" : displayName(result.traitor, me)}</p>
            <button type="button" className="brush-button" onClick={onExit}>처음으로</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
