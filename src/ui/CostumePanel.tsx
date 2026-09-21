import { useEffect, useState } from "react";
import { CLASSES, CLASS_LABEL, WEAPONS, type PlayerClass } from "../game/match/classes";
import { COSTUMES, type Costume } from "../game/render/costumes";
import { myClass, onMyClass, setMyClass } from "./profile";

const CLASS_BLURB: Record<PlayerClass, string> = {
  mage: "마법 지팡이. 빠르게 여러 발, 한 발은 가볍게.",
  archer: "활. 느리지만 한 발 한 발이 묵직하게.",
};

interface CostumePanelProps {
  current: Costume;
  onPick: (costume: Costume) => void;
  onClose: () => void;
  // The menu model behind the panel wears the pick, so the panel only names them.
  online: boolean;
}

const BLURB: Record<string, string> = {
  explorer: "가벼운 차림. 가방 하나 메고 유적으로.",
  scout: "재킷에 얼굴 가리개. 먼지 많은 통로용.",
  raider: "복면까지 쓴 차림. 누가 누군지 알아보기 어렵게.",
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
                <span>{CLASS_BLURB[c]} (피해 {WEAPONS[c].damage} · {(1000 / WEAPONS[c].intervalMs).toFixed(1)}발/초)</span>
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
