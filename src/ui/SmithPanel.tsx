import { useState } from "react";
import { BREAK_FROM, RECIPES, enhanceCost, hasMaterials, type EnhanceOutcome } from "../game/account/forge";
import { ITEMS, MAX_PLUS, gearName, type BagView, type Slot } from "../game/account/items";
import { iconFor } from "../game/render/icons";
import type { WorldClient } from "../net/worldClient";
import { PROBLEM, SLOT_LABEL } from "./BagPanel";

const OUTCOME: Record<EnhanceOutcome, string> = {
  success: "강화 성공!",
  fail: "강화 실패… 장비는 그대로예요",
  broken: "강화 실패… 장비가 부서졌어요",
};

const percent = (n: number) => `${Math.round(n * 100)}%`;

// The smith in the village: enhance what you wear (+1 to +10, riskier the higher it goes) and make
// gear and potions from what monsters drop.
export function SmithPanel({ client, bag, onClose }: { client: WorldClient; bag: BagView | null; onClose: () => void }) {
  const [tab, setTab] = useState<"enhance" | "craft">("enhance");
  const [note, setNote] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [busy, setBusy] = useState(false);
  const stones = bag?.bag.stone ?? 0;

  const enhance = (slot: Slot) => {
    setBusy(true);
    setNote(null);
    void client.enhance(slot).then((r) => {
      setBusy(false);
      if ("outcome" in r) setNote({ text: OUTCOME[r.outcome], tone: r.outcome === "success" ? "good" : "bad" });
      else setNote({ text: PROBLEM[r.problem] ?? "지금은 할 수 없어요", tone: "bad" });
    });
  };
  const craft = (id: string, name: string) => {
    setBusy(true);
    setNote(null);
    void client.craft(id).then((code) => {
      setBusy(false);
      setNote(code ? { text: PROBLEM[code] ?? "지금은 할 수 없어요", tone: "bad" } : { text: `${name} 제작 완료!`, tone: "good" });
    });
  };

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel bag-panel smith-panel" onClick={(e) => e.stopPropagation()}>
        <h2>대장간</h2>
        <p className="bag-gold">{bag ? `${bag.gold.toLocaleString()} 골드 · 강화석 ${stones}개` : "불러오는 중…"}</p>
        <div className="smith-tabs">
          <button type="button" className={`text-button${tab === "enhance" ? " on" : ""}`} onClick={() => setTab("enhance")}>강화</button>
          <button type="button" className={`text-button${tab === "craft" ? " on" : ""}`} onClick={() => setTab("craft")}>제작</button>
        </div>

        {tab === "enhance" && bag && (
          <div className="bag-list">
            {(["weapon", "armor"] as Slot[]).map((slot) => {
              const worn = bag.gear[slot];
              if (!worn) {
                return (
                  <div key={slot} className="bag-row">
                    <span className="bag-slot">{SLOT_LABEL[slot]}</span>
                    <span className="note">장착한 장비가 없어요</span>
                  </div>
                );
              }
              const cost = enhanceCost(worn, bag.plus[worn] ?? 0);
              return (
                <div key={slot} className="bag-row smith-row">
                  <span className="bag-slot">{SLOT_LABEL[slot]}</span>
                  <img className="bag-icon" src={iconFor(worn) ?? undefined} alt="" />
                  <b>{gearName(worn, bag.plus)}</b>
                  {cost ? (
                    <>
                      <button
                        type="button" className="text-button" disabled={busy || stones < cost.stones || bag.gold < cost.gold}
                        onClick={() => enhance(slot)}
                      >
                        강화
                      </button>
                      <span className="bag-blurb">
                        +{cost.to} 성공 {percent(cost.success)}
                        {cost.breaks > 0 && <em className="smith-risk"> · 실패 시 파괴 {percent(cost.breaks)}</em>}
                        {" "}· {cost.gold.toLocaleString()} 골드 · 강화석 {cost.stones}
                      </span>
                    </>
                  ) : (
                    <span className="bag-blurb">최대 강화 (+{MAX_PLUS})</span>
                  )}
                </div>
              );
            })}
            <p className="note">+{BREAK_FROM}부터는 실패하면 장비가 부서질 수 있어요. 강화석은 모든 사냥터의 몬스터가 떨어뜨려요.</p>
          </div>
        )}

        {tab === "craft" && bag && (
          <div className="bag-list">
            {RECIPES.map((recipe) => {
              const ready = hasMaterials(bag.bag, recipe) && bag.gold >= recipe.gold;
              const name = ITEMS[recipe.makes].name;
              return (
                <div key={recipe.id} className="bag-row smith-row">
                  <img className="bag-icon" src={iconFor(recipe.makes) ?? undefined} alt="" />
                  <b>{name}{recipe.n > 1 ? ` ×${recipe.n}` : ""}</b>
                  <button type="button" className="text-button" disabled={busy || !ready} onClick={() => craft(recipe.id, name)}>제작</button>
                  <span className="bag-blurb">
                    {ITEMS[recipe.makes].blurb} · {recipe.needs.map((need) => {
                      const have = bag.bag[need.item] ?? 0;
                      return <span key={need.item} className={have >= need.n ? "" : "smith-short"}>{ITEMS[need.item].name} {have}/{need.n} · </span>;
                    })}
                    {recipe.gold.toLocaleString()} 골드
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {note && <p className={`smith-note ${note.tone}`}>{note.text}</p>}
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
