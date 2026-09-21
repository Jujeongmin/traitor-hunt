import { useEffect, useState } from "react";
import { CLASSES, CLASS_LABEL, WEAPONS, type PlayerClass } from "../game/match/classes";
import { COSTUMES, type Costume } from "../game/render/costumes";
import { myClass, onMyClass, setMyClass } from "./profile";

const CLASS_BLURB: Record<PlayerClass, string> = {
  striker: "장검. 한 번 휘두를 때 묵직하게.",
  guardian: "검과 큰 방패. 우클릭으로 막으면 몬스터 공격을 거의 다 받아낸다.",
};

interface CostumePanelProps {
  current: Costume;
  onPick: (costume: Costume) => void;
  onClose: () => void;
  // The menu model behind the panel wears the pick, so the panel only names them.
  online: boolean;
}

const BLURB: Record<string, string> = {
  hero: "주황 머리 용사. 검과 방패를 든 기본 차림.",
  heroine: "분홍 머리 여용사. 같은 검과 방패, 다른 얼굴.",
};

// Pick the look you wear in the menu, in your party and in the match.
export function CostumePanel({ current, onPick, onClose, online }: CostumePanelProps) {
  const [picked, setPicked] = useState(myClass());
  useEffect(() => onMyClass(setPicked), []);
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="dark-panel costume-panel" onClick={(e) => e.stopPropagation()}>
        <h2>직업</h2>
        <ul className="costume-list">
          {CLASSES.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={`costume-option${c === picked ? " picked" : ""}`}
                onClick={() => setMyClass(c)}
              >
                <b>{CLASS_LABEL[c]}</b>
                <span>{CLASS_BLURB[c]} (공격 {WEAPONS[c].damage} · 막기 {Math.round(WEAPONS[c].block * 100)}%)</span>
                {c === picked && <span className="costume-worn">선택됨</span>}
              </button>
            </li>
          ))}
        </ul>
        <h2>코스튬</h2>
        <p className="note">
          고르면 바로 갈아입습니다. {online ? "같은 방의 다른 플레이어에게도 이 모습으로 보입니다." : "Verse8 서버에 연결되면 다른 플레이어에게도 보입니다."}
        </p>
        <ul className="costume-list">
          {COSTUMES.map((costume) => (
            <li key={costume.id}>
              <button
                type="button"
                className={`costume-option${costume.id === current.id ? " picked" : ""}`}
                onClick={() => onPick(costume)}
              >
                <b>{costume.name}</b>
                <span>{BLURB[costume.id] ?? ""}</span>
                {costume.id === current.id && <span className="costume-worn">입는 중</span>}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
