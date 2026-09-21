import { useEffect, useState } from "react";
import type { StatsView } from "../game/account/ranking";

interface StatsPanelProps {
  onClose: () => void;
  account: string;
  // Null while offline: records live on the game server.
  load: (() => Promise<StatsView>) | null;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

// Your record and the top of the board, opened from the menu.
export function StatsPanel({ onClose, account, load }: StatsPanelProps) {
  const [view, setView] = useState<StatsView | null>(null);
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

  const profile = view?.profile;
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="dark-panel stats-panel" onClick={(e) => e.stopPropagation()}>
        <h2>전적 · 랭킹</h2>
        {!load && <p className="note">Verse8 서버에 연결되면 전적이 쌓입니다. 연습 경기는 기록되지 않습니다.</p>}
        {load && failed && <p className="note">전적을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
        {load && !failed && !view && <p className="note">불러오는 중…</p>}

        {view && profile && (
          <>
            <div className="stats-mine">
              <span className="stats-level">Lv {view.level.level}</span>
              <span className="note">경험치 {view.level.into} / {view.level.need}</span>
              <span className="note">{view.rank === null ? "랭킹 없음" : `랭킹 ${view.rank}위`}</span>
            </div>
            <dl className="stats-grid">
              <div><dt>경기</dt><dd>{profile.games}</dd></div>
              <div><dt>승리</dt><dd>{profile.wins} ({percent(profile.wins, profile.games)})</dd></div>
              <div><dt>탈출</dt><dd>{profile.escapes}</dd></div>
              <div><dt>쓰러짐</dt><dd>{profile.deaths}</dd></div>
              <div><dt>배신자로</dt><dd>{profile.traitorGames}전 {profile.traitorWins}승</dd></div>
              <div><dt>몬스터 처치</dt><dd>{profile.monsterKills}</dd></div>
            </dl>

            <h3>랭킹</h3>
            {view.board.length === 0 ? (
              <p className="note">아직 아무도 경기를 끝내지 않았어요.</p>
            ) : (
              <ol className="stats-board">
                {view.board.map((row, i) => (
                  <li key={row.account} className={row.account === account ? "me" : undefined}>
                    <span className="rank">{i + 1}</span>
                    <span className="who">{row.nickname ?? "(이름 없음)"}</span>
                    <span className="note">Lv {row.level} · {row.games}전 {row.wins}승</span>
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
