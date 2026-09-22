import { ITEMS, type BagView } from "../game/account/items";
import { QUESTS, questDone, type Quest } from "../game/account/quests";
import type { MonsterType } from "../game/world/monsters";

// A quest's reward as one line: XP, gold and any items.
export function rewardText(quest: Quest): string {
  return [
    `${quest.xp.toLocaleString()} XP`, `${quest.gold.toLocaleString()} 골드`,
    ...quest.items.map((i) => `${ITEMS[i.id].name}${i.n > 1 ? ` ×${i.n}` : ""}`),
  ].join(", ");
}

interface QuestLogProps {
  bag: BagView | null;
  inVillage: boolean;
  onSeek: (types: readonly MonsterType[]) => void;
  onReport: () => void;
  onClose: () => void;
}

// The quest tab: the quest you are on in full (what to hunt, how far along, the reward, what to do
// next), the ones already done, and how many are still to come.
export function QuestLog({ bag, inVillage, onSeek, onReport, onClose }: QuestLogProps) {
  const index = bag?.quest.index ?? 0;
  const quest = QUESTS[index];
  const done = bag ? questDone(bag.quest) : false;
  return (
    <div className="side-panel quest-log">
      <h2>퀘스트</h2>
      {!bag ? (
        <p className="note">불러오는 중…</p>
      ) : quest ? (
        <div className={`quest-entry current${done ? " done" : ""}`}>
          <b>{quest.name}{done ? " ✔" : ""}</b>
          <span>{quest.goal}</span>
          <div className="hud-bar xp"><i style={{ width: `${Math.round((bag.quest.count / quest.count) * 100)}%` }} /></div>
          <span className="quest-count">{bag.quest.count} / {quest.count}</span>
          <span className="quest-reward">보상: {rewardText(quest)}</span>
          {done ? (
            inVillage
              ? <button type="button" className="brush-button small" onClick={() => { onReport(); onClose(); }}>촌장에게 보고하러 가기</button>
              : <span className="hint">마을의 촌장에게 보고하면 보상을 받아요</span>
          ) : (
            <button type="button" className="brush-button small" onClick={() => { onSeek(quest.targets); onClose(); }}>찾아가기</button>
          )}
        </div>
      ) : (
        <p className="note">모든 퀘스트를 마쳤어요.</p>
      )}
      {index > 0 && (
        <>
          <h3>완료한 퀘스트</h3>
          {QUESTS.slice(0, index).reverse().map((q) => (
            <div key={q.name} className="quest-entry past">
              <b>{q.name} ✔</b>
              <span>{q.goal}</span>
            </div>
          ))}
        </>
      )}
      {quest && index + 1 < QUESTS.length && <p className="note">앞으로 {QUESTS.length - index - 1}개의 퀘스트가 더 있어요.</p>}
      <button type="button" className="text-button" onClick={onClose}>닫기</button>
    </div>
  );
}

// The moment a quest is done: a panel in the middle of the screen, shown once, that fades by itself.
export function QuestCompleteBanner({ quest, inVillage, onClose }: { quest: Quest; inVillage: boolean; onClose: () => void }) {
  return (
    <div className="quest-complete" role="status" onClick={onClose}>
      <span className="quest-complete-title">퀘스트 완료!</span>
      <b>{quest.name}</b>
      <span>보상: {rewardText(quest)}</span>
      <span className="hint">{inVillage ? "촌장에게 보고하고 보상을 받으세요" : "마을의 촌장에게 보고하고 보상을 받으세요"}</span>
    </div>
  );
}
