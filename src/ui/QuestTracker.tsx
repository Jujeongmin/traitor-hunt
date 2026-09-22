import type { BagView } from "../game/account/items";
import { QUESTS, questDone } from "../game/account/quests";
import type { MonsterType } from "../game/world/monsters";

interface QuestTrackerProps {
  bag: BagView | null;
  // Auto-battle is already heading for this quest's monsters.
  seeking: boolean;
  inVillage: boolean;
  // Tapping an unfinished quest sends you hunting for its monsters.
  onSeek: (types: readonly MonsterType[]) => void;
  // Tapping a finished one (in the village) walks you to the elder to report it.
  onReport: () => void;
  // The key that does what tapping it does, shown in its corner (none on a touch screen).
  keyLabel: string | null;
}

// The quest you are on, at the right, kept short: its name, what to hunt and how far along (the
// reward is in the quest tab). Tapping it goes after its monsters; once done, it is reported to the
// elder in the village.
export function QuestTracker({ bag, seeking, inVillage, onSeek, onReport, keyLabel }: QuestTrackerProps) {
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
  const hint = done
    ? inVillage ? "눌러서 촌장에게 보고하기" : "마을의 촌장에게 보고하세요"
    : seeking ? "찾아가는 중…" : "눌러서 찾아가기";
  return (
    <div
      className={`hud-quest${seeking ? " seeking" : ""}${done && !inVillage ? "" : " clickable"}${done ? " done" : ""}`}
      role="button"
      onClick={() => {
        if (!done) onSeek(quest.targets);
        else if (inVillage) onReport();
      }}
    >
      <b>{quest.name}{done ? " ✔" : ""}</b>
      <span>{quest.goal} <span className="count">{bag.quest.count}/{quest.count}</span></span>
      <span className="hint">{hint}</span>
      {keyLabel && <kbd className="hud-key">{keyLabel}</kbd>}
    </div>
  );
}
