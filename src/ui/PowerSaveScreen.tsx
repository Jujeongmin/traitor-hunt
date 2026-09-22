import { useEffect, useRef, useState } from "react";
import type { BagView } from "../game/account/items";
import type { WorldHud } from "../game/render/WorldView";
import type { WorldClient } from "../net/worldClient";

// Two taps (or clicks) this close together wake the screen up.
const DOUBLE_TAP_MS = 400;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
};

// Power saving (절전): a dark screen with how the hunt is going, while the world goes on undrawn.
// What was earned is counted from the moment it began.
export function PowerSaveScreen({ client, hud, bag, onWake }: {
  client: WorldClient;
  hud: WorldHud;
  bag: BagView | null;
  onWake: () => void;
}) {
  const start = useRef({ at: Date.now(), xp: client.state.me?.xp ?? 0, gold: bag?.gold ?? null });
  if (start.current.gold === null && bag) start.current.gold = bag.gold;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const lastTap = useRef(0);
  const xp = Math.max(0, (client.state.me?.xp ?? 0) - start.current.xp);
  const gold = bag && start.current.gold !== null ? bag.gold - start.current.gold : 0;
  return (
    <div
      className="power-save"
      onPointerDown={() => {
        const t = Date.now();
        if (t - lastTap.current < DOUBLE_TAP_MS) onWake();
        lastTap.current = t;
      }}
    >
      <b className="power-save-title">절전 모드</b>
      <span className="power-save-zone">{hud.zone} · 채널 {hud.channel}</span>
      <div className="power-save-vitals">
        <span>Lv {hud.level}</span>
        <div className="hud-bar hp"><i style={{ width: `${Math.round((hud.hp / hud.maxHp) * 100)}%` }} /></div>
        <div className="hud-bar xp"><i style={{ width: `${Math.round((hud.xpInto / hud.xpNeed) * 100)}%` }} /></div>
      </div>
      <dl className="power-save-stats">
        <dt>경과 시간</dt><dd>{clock(now - start.current.at)}</dd>
        <dt>얻은 경험치</dt><dd>+{xp.toLocaleString()}</dd>
        <dt>얻은 골드</dt><dd>{gold >= 0 ? "+" : ""}{gold.toLocaleString()}</dd>
        <dt>남은 물약</dt><dd>{hud.potions}개</dd>
        <dt>자동 전투</dt><dd className={hud.auto ? "on" : "off"}>{hud.auto ? "사냥 중" : "꺼짐"}</dd>
      </dl>
      {hud.dead && <p className="power-save-warn">쓰러졌어요 — 두 번 눌러 확인하세요</p>}
      <span className="power-save-hint">화면을 두 번 누르면 돌아가요</span>
    </div>
  );
}
