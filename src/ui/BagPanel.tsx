import { useState } from "react";
import { ITEMS, ITEM_IDS, SHOP_ITEMS, sellPrice, type BagView, type ItemId, type Slot } from "../game/account/items";
import type { WorldClient } from "../net/worldClient";

const PROBLEM: Record<string, string> = {
  not_enough_gold: "골드가 모자라요",
  not_in_village: "상점은 마을에 있어요",
  no_item: "가방에 없어요",
  unavailable: "지금은 할 수 없어요",
};

const SLOT_LABEL: Record<Slot, string> = { weapon: "무기", armor: "갑옷" };

interface PanelProps {
  client: WorldClient;
  bag: BagView | null;
  onClose: () => void;
}

// Runs a bag or shop call and keeps the reason if it was refused.
function useAction(): [string | null, (run: () => Promise<string | null>) => void] {
  const [problem, setProblem] = useState<string | null>(null);
  return [problem, (run) => {
    setProblem(null);
    void run().then((code) => setProblem(code ? PROBLEM[code] ?? "지금은 할 수 없어요" : null));
  }];
}

// Your gold, what you wear and what you carry: wear gear, drink potions, and (in the village) sell.
export function BagPanel({ client, bag, onClose, inVillage }: PanelProps & { inVillage: boolean }) {
  const [problem, act] = useAction();
  const items = ITEM_IDS.filter((id) => (bag?.bag[id] ?? 0) > 0);
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel bag-panel" onClick={(e) => e.stopPropagation()}>
        <h2>가방</h2>
        <p className="bag-gold">{bag ? `${bag.gold.toLocaleString()} 골드` : "불러오는 중…"}</p>
        <div className="bag-gear">
          {(["weapon", "armor"] as Slot[]).map((slot) => {
            const worn = bag?.gear[slot] ?? null;
            return (
              <div key={slot} className="bag-row">
                <span className="bag-slot">{SLOT_LABEL[slot]}</span>
                <b>{worn ? ITEMS[worn].name : "없음"}</b>
                <span className="bag-blurb">{worn ? ITEMS[worn].blurb : ""}</span>
                {worn && <button type="button" className="text-button" onClick={() => act(() => client.unequip(slot))}>해제</button>}
              </div>
            );
          })}
        </div>
        <div className="bag-list">
          {items.length === 0 && <p className="note">가방이 비었어요</p>}
          {items.map((id) => (
            <div key={id} className="bag-row">
              <b>{ITEMS[id].name}</b>
              <span className="bag-count">×{bag!.bag[id]}</span>
              <span className="bag-blurb">{ITEMS[id].blurb}</span>
              {ITEMS[id].kind === "potion"
                ? <button type="button" className="text-button" onClick={() => act(() => client.drink(id))}>마시기</button>
                : <button type="button" className="text-button" onClick={() => act(() => client.equip(id))}>장착</button>}
              {inVillage && (
                <button type="button" className="text-button" onClick={() => act(() => client.sell(id))}>
                  팔기 ({sellPrice(id)})
                </button>
              )}
            </div>
          ))}
        </div>
        {problem && <p className="bag-problem">{problem}</p>}
        <p className="note">Q: 물약 마시기 · I: 가방</p>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}

// The village shop: potions and the gear sold for gold.
export function ShopPanel({ client, bag, onClose }: PanelProps) {
  const [problem, act] = useAction();
  const buy = (id: ItemId, n: number) => act(() => client.buy(id, n));
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel bag-panel" onClick={(e) => e.stopPropagation()}>
        <h2>마을 상점</h2>
        <p className="bag-gold">{bag ? `${bag.gold.toLocaleString()} 골드` : "불러오는 중…"}</p>
        <div className="bag-list">
          {SHOP_ITEMS.map((id) => (
            <div key={id} className="bag-row">
              <b>{ITEMS[id].name}</b>
              <span className="bag-count">{ITEMS[id].price} 골드</span>
              <span className="bag-blurb">{ITEMS[id].blurb}</span>
              <button type="button" className="text-button" onClick={() => buy(id, 1)}>사기</button>
              {ITEMS[id].kind === "potion" && (
                <button type="button" className="text-button" onClick={() => buy(id, 10)}>10개</button>
              )}
            </div>
          ))}
        </div>
        {problem && <p className="bag-problem">{problem}</p>}
        <p className="note">몬스터가 골드와 장비를 떨어뜨려요. 팔기는 가방에서.</p>
        <button type="button" className="text-button" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
