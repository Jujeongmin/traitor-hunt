import { useState } from "react";
import type { BagView } from "../game/account/items";
import { ITEMS } from "../game/account/items";
import { QUESTS, questDone } from "../game/account/quests";
import type { MonsterType } from "../game/world/monsters";
import type { WorldClient } from "../net/worldClient";

interface QuestTrackerProps {
  client: WorldClient;
  bag: BagView | null;
  // Auto-battle is already heading for this quest's monsters.
  seeking: boolean;
  // Tapping the quest sends you hunting for its monsters.
  onSeek: (types: readonly MonsterType[]) => void;
}

// The quest you are on, at the right: what to hunt, how far along, and a button for the reward
// once it is done. Tapping it sets auto-battle walking to those monsters.
export function QuestTracker({ client, bag, seeking, onSeek }: QuestTrackerProps) {
  const [busy, setBusy] = useState(false);
  if (!bag) return null;
  const quest = QUESTS[bag.quest.index];
  if (!quest) {
    return (
      <div className="hud-quest">
        <b>모든 퀘스트 완료</b>
      </div>
    );
  }
  const done = questDone(bag.quest);
  const reward = [`${quest.xp} XP`, `${quest.gold} 골드`, ...quest.items.map((i) => `${ITEMS[i.id].name}${i.n > 1 ? ` ×${i.n}` : ""}`)];
  return (
    <div
      className={`hud-quest${seeking ? " seeking" : ""}${done ? "" : " clickable"}`}
      role={done ? undefined : "button"}
      onClick={() => {
        if (!done) onSeek(quest.targets);
      }}
    >
      <b>{quest.name}</b>
      <span>{quest.goal} <span className="count">{bag.quest.count}/{quest.count}</span></span>
      <span>보상: {reward.join(", ")}</span>
      {done ? (
        <button
          type="button"
          className="brush-button small"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            setBusy(true);
            void client.claimQuest().finally(() => setBusy(false));
          }}
        >
          보상 받기
        </button>
      ) : (
        <span className="hint">{seeking ? "찾아가는 중…" : "눌러서 찾아가기"}</span>
      )}
    </div>
  );
}
