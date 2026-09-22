import { useState } from "react";
import { ITEMS, type BagView } from "../game/account/items";
import { DAILY_QUESTS, QUESTS, dailyToday, questDone, type Quest } from "../game/account/quests";
import type { MonsterType } from "../game/world/monsters";

// A quest's reward as one line: XP, gold and any items.
export function rewardText(quest: { xp?: number; gold: number; items: Quest["items"] }): string {
  return [
    ...(quest.xp ? [`${quest.xp.toLocaleString()} XP`] : []), `${quest.gold.toLocaleString()} 골드`,
    ...quest.items.map((i) => `${ITEMS[i.id].name}${i.n > 1 ? ` ×${i.n}` : ""}`),
  ].join(", ");
}

// The day's quests, one per hunting field: how far along, the reward, and claiming it.
function DailyList({ bag, onClaimDaily }: { bag: BagView; onClaimDaily: (id: string) => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const today = dailyToday(bag.daily, Date.now());
  return (
    <>
      <h3>일일 퀘스트 · 매일 0시에 새로 시작</h3>
      {DAILY_QUESTS.map((q) => {
        const count = today.counts[q.id] ?? 0;
        const claimed = today.claimed.includes(q.id);
        const done = count >= q.count;
        return (
          <div key={q.id} className={`quest-entry daily${done ? " done" : ""}${claimed ? " past" : ""}`}>
            <b>{q.name}{claimed ? " ✔" : ""}</b>
            <span>{q.goal}</span>
            <div className="hud-bar xp"><i style={{ width: `${Math.round((count / q.count) * 100)}%` }} /></div>
            <span className="quest-count">{count} / {q.count}</span>
            <span className="quest-reward">보상: {rewardText(q)}</span>
            {done && !claimed && (
              <button
                type="button" className="brush-button small" disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setProblem(null);
                  void onClaimDaily(q.id).then((code) => {
                    setBusy(false);
                    if (code) setProblem("지금은 받을 수 없어요");
                  });
                }}
              >
                보상 받기
              </button>
            )}
            {claimed && <span className="hint">오늘 보상을 받았어요</span>}
          </div>
        );
      })}
      {problem && <p className="note">{problem}</p>}
    </>
  );
}

interface QuestLogProps {
  bag: BagView | null;
  inVillage: boolean;
  onSeek: (types: readonly MonsterType[]) => void;
  onReport: () => void;
  onClaimDaily: (id: string) => Promise<string | null>;
  onClose: () => void;
}

// The quest tab: the quest you are on in full (what to hunt, how far along, the reward, what to do
// next), the ones already done, and how many are still to come.
export function QuestLog({ bag, inVillage, onSeek, onReport, onClaimDaily, onClose }: QuestLogProps) {
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
      {bag && <DailyList bag={bag} onClaimDaily={onClaimDaily} />}
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
