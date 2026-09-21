import { useState } from "react";
import { WORLDS } from "../game/account/worlds";

interface WorldPickerProps {
  // The server you played on last time, marked so you can go back to your friends.
  current: string | null;
  onPick: (id: string) => Promise<void>;
  onClose: () => void;
}

// The first step of starting: which server to play on. Picking one saves it and moves on.
export function WorldPicker({ current, onPick, onClose }: WorldPickerProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const pick = async (id: string) => {
    if (saving) return;
    setSaving(id);
    setFailed(false);
    try {
      await onPick(id);
    } catch {
      setFailed(true);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel world-panel" onClick={(e) => e.stopPropagation()}>
        <h2>서버 선택</h2>
        <p className="note">같은 서버를 고른 플레이어끼리 만나요. 친구와 같은 서버를 골라 보세요.</p>
        <ul className="world-list">
          {WORLDS.map((w) => (
            <li key={w.id}>
              <button type="button" className={`world-card${w.id === current ? " picked" : ""}`} onClick={() => void pick(w.id)} disabled={!!saving}>
                <b>{w.name}</b>
                <span>{saving === w.id ? "들어가는 중…" : w.id === current ? "최근 접속" : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {failed && <p className="nickname-problem">서버를 고르지 못했어요. 잠시 뒤 다시 시도해 주세요</p>}
        <button type="button" className="text-button close" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
