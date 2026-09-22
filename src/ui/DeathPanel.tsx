import { useState } from "react";
import { DEATH_XP_SHARE, REVIVE_HP_SHARE, reviveCost } from "../game/account/level";
import type { WorldClient } from "../net/worldClient";

const PROBLEM: Record<string, string> = {
  not_enough_gold: "골드가 모자라요",
};

// Fallen: what it cost, and the two ways up: back in the village for nothing, or here for gold.
export function DeathPanel({ client, level, lostXp, gold, travelling }: {
  client: WorldClient;
  level: number;
  lostXp: number;
  // Null until the bag has loaded.
  gold: number | null;
  travelling: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cost = reviveCost(level);
  const short = gold !== null && gold < cost;
  return (
    <div className="pain fallen">
      <div className="solid-panel world-panel death-panel">
        <p className="band">쓰러졌어요</p>
        <p className="death-loss">
          {lostXp > 0 ? `경험치 ${lostXp.toLocaleString()}를 잃었어요` : "잃은 경험치는 없어요"}
          <span className="note">쓰러지면 이번 레벨 경험치의 {Math.round(DEATH_XP_SHARE * 100)}%를 잃어요 (레벨은 내려가지 않아요)</span>
        </p>
        <button
          type="button" className="brush-button" disabled={busy || travelling || short}
          onClick={() => {
            setBusy(true);
            setProblem(null);
            void client.reviveHere().then((code) => {
              setBusy(false);
              if (code) setProblem(PROBLEM[code] ?? "지금은 할 수 없어요");
            });
          }}
        >
          이 자리에서 부활 · {cost.toLocaleString()} 골드
        </button>
        <span className="note">체력 {Math.round(REVIVE_HP_SHARE * 100)}%로 일어나고, 잠깐 몬스터가 공격하지 않아요{short ? " · 골드가 모자라요" : ""}</span>
        <button type="button" className="brush-button" disabled={busy || travelling} onClick={() => void client.respawn()}>
          마을에서 부활 · 무료
        </button>
        {problem && <p className="bag-problem">{problem}</p>}
      </div>
    </div>
  );
}
