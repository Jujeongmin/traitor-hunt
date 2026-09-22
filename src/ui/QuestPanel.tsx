import { useState } from "react";
import { ITEMS, type BagView } from "../game/account/items";
import { QUESTS, questDone } from "../game/account/quests";
import type { MonsterType } from "../game/world/monsters";
import type { WorldClient } from "../net/worldClient";
import { objectParticle } from "./korean";

interface QuestPanelProps {
  client: WorldClient;
  bag: BagView | null;
  onSeek: (types: readonly MonsterType[]) => void;
  onClose: () => void;
}

const PROBLEM: Record<string, string> = {
  not_near: "촌장 곁에 서서 이야기하세요",
  quest_unfinished: "아직 다 끝나지 않았어요",
};

// Talking to the elder: the quest you are on, how far along it is, and the reward; hand it in when
// done, or set off after its monsters.
export function QuestPanel({ client, bag, onSeek, onClose }: QuestPanelProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quest = bag ? QUESTS[bag.quest.index] : undefined;
  const done = bag ? questDone(bag.quest) : false;
  const reward = quest
    ? [`${quest.xp.toLocaleString()} XP`, `${quest.gold.toLocaleString()} 골드`, ...quest.items.map((i) => `${ITEMS[i.id].name}${i.n > 1 ? ` ×${i.n}` : ""}`)]
    : [];
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel npc-panel" onClick={(e) => e.stopPropagation()}>
        <p className="npc-name">촌장 마르타</p>
        {!bag ? (
          <p className="note">불러오는 중…</p>
        ) : !quest ? (
          <p className="npc-line">"이제 이 숲에서 자네를 당해낼 것은 없네. 고맙네, 사냥꾼."</p>
        ) : (
          <>
            <p className="npc-line">
              {done ? `"${quest.name}, 잘 해냈군! 약속한 보상일세."` : `"${quest.goal}${objectParticle(quest.goal)} 부탁하네."`}
            </p>
            <div className="npc-quest">
              <b>{quest.name}</b>
              <span>{quest.goal} · {bag.quest.count}/{quest.count}</span>
              <span>보상: {reward.join(", ")}</span>
            </div>
            {done ? (
              <button
                type="button" className="brush-button" disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setProblem(null);
                  void client.claimQuest().then((code) => {
                    setBusy(false);
                    if (code) setProblem(PROBLEM[code] ?? "지금은 받을 수 없어요");
                  });
                }}
              >
                보상 받기
              </button>
            ) : (
              <button type="button" className="brush-button" onClick={() => { onSeek(quest.targets); onClose(); }}>
                찾아가기
              </button>
            )}
          </>
        )}
        {problem && <p className="bag-problem">{problem}</p>}
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
