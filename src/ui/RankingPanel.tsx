import { useEffect, useRef, useState } from "react";
import { ITEMS } from "../game/account/items";
import type { RankDetail, RankRow, RankingView } from "../game/account/ranking";
import { CLASS_LABEL, type PlayerClass } from "../game/combat/classes";
import { JOBS, type JobId } from "../game/combat/jobs";

interface RankingPanelProps {
  onClose: () => void;
  account: string;
  // Null while offline: levels live on the game server.
  load: (() => Promise<RankingView>) | null;
  // One character in full, for a tapped line.
  loadDetail: ((id: string) => Promise<RankDetail>) | null;
}

// A character's class as the board shows it: its advanced class once it has one.
function classText(playerClass: PlayerClass | undefined, job: JobId | null | undefined): string {
  if (job) return JOBS[job].name;
  return playerClass ? CLASS_LABEL[playerClass] : "-";
}

// Your level and 전투력, and the top of the board by experience: name, level and class on each line.
// Tapping a line shows that character in full.
export function RankingPanel({ onClose, account, load, loadDetail }: RankingPanelProps) {
  const [view, setView] = useState<RankingView | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<RankRow | null>(null);
  const [detail, setDetail] = useState<RankDetail | null>(null);
  const [detailFailed, setDetailFailed] = useState(false);
  // Loaded once when the panel opens (the screens behind it redraw many times a second).
  const loader = useRef(load);
  const detailLoader = useRef(loadDetail);

  useEffect(() => {
    const load = loader.current;
    if (!load) return;
    let live = true;
    load().then(
      (next) => live && setView(next),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const load = detailLoader.current;
    setDetail(null);
    setDetailFailed(false);
    if (!picked || !load) return;
    let live = true;
    load(picked.id).then(
      (next) => live && setDetail(next),
      () => live && setDetailFailed(true),
    );
    return () => {
      live = false;
    };
  }, [picked]);

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel stats-panel" onClick={(e) => e.stopPropagation()}>
        <h2>랭킹</h2>
        {!load && <p className="note">Verse8 서버에 연결되면 볼 수 있어요.</p>}
        {load && failed && <p className="note">랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
        {load && !failed && !view && <p className="note">불러오는 중…</p>}

        {view && !picked && (
          <>
            <div className="stats-mine">
              <span className="stats-level">Lv {view.level.level}</span>
              <span className="note">전투력 {view.power.toLocaleString()}</span>
              <span className="note">{view.rank === null ? "랭킹 없음" : `${view.rank}위`}</span>
            </div>
            {view.board.length === 0 ? (
              <p className="note">아직 경험치를 쌓은 모험가가 없어요.</p>
            ) : (
              <ol className="stats-board">
                <li className="head">
                  <span className="rank">#</span>
                  <span>닉네임</span>
                  <span>직업</span>
                  <span>레벨</span>
                </li>
                {view.board.map((row, i) => (
                  <li
                    key={row.id} role="button" tabIndex={0}
                    className={`pick${row.account === account ? " me" : ""}`}
                    onClick={() => setPicked(row)}
                    onKeyDown={(e) => e.key === "Enter" && setPicked(row)}
                  >
                    <span className="rank">{i + 1}</span>
                    <span className="who">{row.nickname ?? "(이름 없음)"}</span>
                    <span className="note">{classText(row.playerClass, row.job)}</span>
                    <span className="note">Lv {row.level}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {picked && (
          <div className="rank-detail">
            {!detail && !detailFailed && <p className="note">불러오는 중…</p>}
            {detailFailed && <p className="note">정보를 불러오지 못했어요.</p>}
            {detail && (
              <>
                <h3>{detail.nickname}</h3>
                <dl>
                  <dt>순위</dt><dd>{detail.rank === null ? "-" : `${detail.rank}위`}</dd>
                  <dt>서버</dt><dd>{detail.world}</dd>
                  <dt>직업</dt>
                  <dd>{detail.job ? `${JOBS[detail.job].name} (${CLASS_LABEL[detail.playerClass]})` : CLASS_LABEL[detail.playerClass]}</dd>
                  <dt>레벨</dt><dd>Lv {detail.level}</dd>
                  <dt>경험치</dt><dd>{detail.xp.toLocaleString()}</dd>
                  <dt>전투력</dt><dd className="power">{detail.power.toLocaleString()}</dd>
                  <dt>무기</dt><dd>{detail.gear.weapon ? ITEMS[detail.gear.weapon].name : "없음"}</dd>
                  <dt>갑옷</dt><dd>{detail.gear.armor ? ITEMS[detail.gear.armor].name : "없음"}</dd>
                </dl>
              </>
            )}
            <button type="button" className="text-button" onClick={() => setPicked(null)}>목록으로</button>
          </div>
        )}
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
