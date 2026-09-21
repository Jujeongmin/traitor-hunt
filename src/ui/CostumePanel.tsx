import { COSTUMES, type Costume } from "../game/render/costumes";

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
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="dark-panel costume-panel" onClick={(e) => e.stopPropagation()}>
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
