import { useEffect, useState } from "react";
import type { RankingView } from "../game/account/ranking";

interface RankingPanelProps {
  onClose: () => void;
  account: string;
  // Null while offline: levels live on the game server.
  load: (() => Promise<RankingView>) | null;
}

// Your level and the top of the board by experience.
export function RankingPanel({ onClose, account, load }: RankingPanelProps) {
  const [view, setView] = useState<RankingView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (next) => live && setView(next),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [load]);

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel stats-panel" onClick={(e) => e.stopPropagation()}>
        <h2>랭킹</h2>
        {!load && <p className="note">Verse8 서버에 연결되면 볼 수 있어요.</p>}
        {load && failed && <p className="note">랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
        {load && !failed && !view && <p className="note">불러오는 중…</p>}

        {view && (
          <>
            <div className="stats-mine">
              <span className="stats-level">Lv {view.level.level}</span>
              <span className="note">경험치 {view.level.into} / {view.level.need}</span>
              <span className="note">{view.rank === null ? "랭킹 없음" : `${view.rank}위`}</span>
            </div>
            {view.board.length === 0 ? (
              <p className="note">아직 경험치를 쌓은 모험가가 없어요.</p>
            ) : (
              <ol className="stats-board">
                {view.board.map((row, i) => (
                  <li key={row.account} className={row.account === account ? "me" : undefined}>
                    <span className="rank">{i + 1}</span>
                    <span className="who">{row.nickname ?? "(이름 없음)"}</span>
                    <span className="note">Lv {row.level}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
