import { useState } from "react";
import type { BagView } from "../game/account/items";
import { ITEMS } from "../game/account/items";
import { QUESTS, questDone } from "../game/account/quests";
import type { WorldClient } from "../net/worldClient";

// The quest you are on, top left: what to hunt, how far along, and a button for the reward once it
// is done.
export function QuestTracker({ client, bag }: { client: WorldClient; bag: BagView | null }) {
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
    <div className="hud-quest">
      <b>{quest.name}</b>
      <span>{quest.goal} <span className="count">{bag.quest.count}/{quest.count}</span></span>
      <span>보상: {reward.join(", ")}</span>
      {done && (
        <button
          type="button"
          className="brush-button small"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void client.claimQuest().finally(() => setBusy(false));
          }}
        >
          보상 받기
        </button>
      )}
    </div>
  );
}
