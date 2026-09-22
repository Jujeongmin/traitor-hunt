import { useEffect, useRef, useState } from "react";
import { typing } from "../game/render/FpsInput";
import { ChatBox } from "./ChatBox";
import { SmithPanel } from "./SmithPanel";
import { playMusic } from "../game/audio/music";
import { trackFor } from "../game/audio/musicTrack";
import type { PlayerClass } from "../game/combat/classes";
import type { Costume } from "../game/render/costumes";
import { WorldView, type WorldHud } from "../game/render/WorldView";
import type { ZoneEntry } from "../game/world/zones";
import type { WorldClient, WorldState } from "../net/worldClient";
import type { BagView } from "../game/account/items";
import { START_ZONE } from "../game/world/zones";
import { BagPanel, ShopPanel } from "./BagPanel";
import { QuestTracker } from "./QuestTracker";
import { SkillBar } from "./SkillBar";
import { PadButtons, TouchStick, isTouchDevice } from "./TouchControls";
import { SkillPanel } from "./SkillPanel";
import { RankingPanel } from "./RankingPanel";
import { iconFor } from "../game/render/icons";
import { QuestPanel } from "./QuestPanel";
import { QuestCompleteBanner, QuestLog } from "./QuestLog";
import { QUESTS, questDone } from "../game/account/quests";
import { SettingsPanel } from "./SettingsPanel";

interface WorldScreenProps {
  client: WorldClient;
  playerClass: PlayerClass;
  costume: Costume;
  name: string;
  owned: boolean;
  onExit: () => void;
}

const TRAVEL_PROBLEM: Record<string, string> = {
  not_owned: "정식판을 구매하면 들어갈 수 있는 구역이에요",
  zone_full: "모든 채널이 가득 찼어요. 잠시 뒤 다시 시도해 주세요",
  not_near: "포털 가까이 서 주세요",
  too_low: "레벨이 모자라요",
};

const ENTER_PROBLEM: Record<string, string> = {
  unavailable: "월드에 들어가지 못했어요",
};

// A room server that would not take the connection: usually the network or a busy server.
function enterProblem(error: string | null): string {
  if (error && ENTER_PROBLEM[error]) return ENTER_PROBLEM[error];
  if (error?.includes("RS connect") || error?.includes("RS:connect") || error?.includes("rs_connect_failed")) {
    return "게임 서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
  }
  return `월드에 들어가지 못했어요 (${error})`;
}

// The world: enters on mount, shows the zone you are in (one WorldView per zone and channel), and
// takes you through portals.
export function WorldScreen({ client, playerClass, costume, name, owned, onExit }: WorldScreenProps) {
  const [state, setState] = useState<WorldState>(client.state);
  const [problem, setProblem] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    // The screen only cares where you are and whether you are moving between zones; the others'
    // poses change many times a second and go straight to the 3D view, not through React.
    const off = client.onChange((next) =>
      setState((prev) => (prev.phase === next.phase && prev.entry === next.entry && prev.error === next.error && prev.bag === next.bag
        ? prev : next)));
    void client.enter();
    return () => {
      off();
      void client.leave();
    };
  }, [client]);

  useEffect(() => {
    playMusic(trackFor(state.entry?.zone ?? null));
  }, [state.entry?.zone]);

  if (state.phase === "error") {
    return (
      <div className="overlay">
        <div className="solid-panel world-panel">
          <p>{enterProblem(state.error)}</p>
          <button type="button" className="brush-button small" onClick={() => void client.enter()}>다시 시도</button>
          <button type="button" className="text-button" onClick={onExit}>메뉴로</button>
        </div>
      </div>
    );
  }
  if (!state.entry) return <div className="overlay">월드에 들어가는 중…</div>;
  return (
    <ZoneScreen
      key={state.entry.roomId}
      entry={state.entry}
      client={client}
      playerClass={playerClass}
      costume={costume}
      name={name}
      owned={owned}
      travelling={state.phase === "travelling"}
      bag={state.bag}
      problem={problem}
      onProblem={(code) => setProblem({ text: TRAVEL_PROBLEM[code] ?? "지금은 갈 수 없어요", at: performance.now() })}
      onExit={onExit}
    />
  );
}

interface ZoneScreenProps extends Omit<WorldScreenProps, "onExit"> {
  entry: ZoneEntry;
  bag: BagView | null;
  travelling: boolean;
  problem: { text: string; at: number } | null;
  onProblem: (code: string) => void;
  onExit: () => void;
}

// How long the quest-complete panel stays up.
const QUEST_BANNER_MS = 4500;
// How long a refused portal's message stays up.
const PROBLEM_MS = 3000;

function ZoneScreen({ entry, client, playerClass, costume, name, owned, travelling, bag, problem, onProblem, onExit }: ZoneScreenProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<WorldView | null>(null);
  const [hud, setHud] = useState<WorldHud | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  // Which of the bag and the shop is open.
  const [panel, setPanel] = useState<"bag" | "shop" | "smith" | "skills" | "ranking" | "quest" | "quests" | null>(null);
  // The quest just finished, shown once as a panel in the middle of the screen.
  const [finished, setFinished] = useState<number | null>(null);
  const lastQuest = useRef<{ index: number; done: boolean } | null>(null);
  useEffect(() => {
    if (!bag) return;
    const done = questDone(bag.quest);
    const last = lastQuest.current;
    // Only a quest seen going from unfinished to finished, not one already done when you arrive.
    if (last && last.index === bag.quest.index && !last.done && done) setFinished(bag.quest.index);
    lastQuest.current = { index: bag.quest.index, done };
  }, [bag]);
  useEffect(() => {
    if (finished === null) return;
    const timer = setTimeout(() => setFinished(null), QUEST_BANNER_MS);
    return () => clearTimeout(timer);
  }, [finished]);
  const inVillage = entry.zone === START_ZONE;
  const [now, setNow] = useState(() => performance.now());
  const touch = isTouchDevice();

  useEffect(() => {
    const next = new WorldView(host.current!, client, {
      entry, playerClass, costume, name, owned,
      onProgress: (done, total) => setProgress(done / total),
      onTalk: (id) => {
        document.exitPointerLock?.();
        setPanel(id === "merchant" ? "shop" : id === "smith" ? "smith" : "quest");
      },
      onTravel: (to) => {
        void client.travel(to).then((code) => {
          if (code) {
            view.current?.travelRefused();
            onProblem(code);
          }
        });
      },
    });
    view.current = next;
    if (import.meta.env.DEV) (window as unknown as { __world?: unknown }).__world = next.debugHandle();
    const off = next.onHud((h) => {
      setHud(h);
      setNow(performance.now());
    });
    void next.start().then(() => setReady(true));
    return () => {
      off();
      next.dispose();
      view.current = null;
    };
    // One view per zone: the key on this component remounts it for a new entry.
  }, []);

  // Escape opens the menu (the pointer lock lets go of the mouse first); I opens the bag.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === "Escape") setMenu((m) => !m);
      if (e.code === "KeyI") {
        document.exitPointerLock?.();
        setPanel((p) => (p === "bag" ? null : "bag"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showProblem = problem && now - problem.at < PROBLEM_MS;
  return (
    <div className="app" ref={host}>
      <div className={`ui${touch ? " touch" : ""}`}>
      {!ready && <div className="overlay">숲을 불러오는 중… {Math.round(progress * 100)}%</div>}
      {travelling && <div className="overlay">이동하는 중…</div>}
      {hud && (
        <>
          {touch && view.current && <TouchStick controls={view.current.controls} />}
          <div className="hud-left">
            <div className="hud-top band">
              <b>{hud.zone}</b>
              <span>채널 {hud.channel}</span>
            </div>
            <div className="hud-vitals">
              <div className="hud-vitals-row">
                <b>Lv {hud.level}</b>
                <span>{Math.ceil(hud.hp)} / {hud.maxHp}</span>
                {hud.gain !== null && <em className="hud-gain">+{hud.gain} XP</em>}
              </div>
              <div className="hud-bar hp"><i style={{ width: `${Math.round((hud.hp / hud.maxHp) * 100)}%` }} /></div>
              <div className="hud-bar xp"><i style={{ width: `${Math.round((hud.xpInto / hud.xpNeed) * 100)}%` }} /></div>
            </div>
          </div>
          <div className="hud-menu-buttons">
            {([
              ["ranking", "랭킹", () => setPanel("ranking")],
              ["quests", "퀘스트", () => setPanel((p) => (p === "quests" ? null : "quests"))],
              ["skills", "스킬", () => setPanel((p) => (p === "skills" ? null : "skills"))],
              ["forge", "대장간", () => setPanel((p) => (p === "smith" ? null : "smith"))],
              ["bag", "가방", () => setPanel("bag")],
              ["menu", "메뉴", () => setMenu(true)],
            ] as const).map(([id, label, open]) => (
              <button key={id} type="button" className={`hud-icon-button${panel === id || (id === "forge" && panel === "smith") ? " on" : ""}`} onClick={open}>
                <img src={iconFor(`ui_${id}`) ?? undefined} alt="" draggable={false} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {hud.notes.length > 0 && (
            <div className="hud-notes">
              {hud.notes.map((text, i) => <span key={i} className="band">{text}</span>)}
            </div>
          )}
          {hud.npc && !hud.portal && (
            <div className="hud-prompt band">{hud.npc.name} — {hud.npc.role} · 대화 (E)</div>
          )}
          {hud.portal && (
            <div className="hud-prompt band">
              {hud.portal.locked ? `${hud.portal.to} — 정식판이 필요해요`
                : hud.portal.needLevel ? `${hud.portal.to} — Lv${hud.portal.needLevel}부터 갈 수 있어요`
                  : `${hud.portal.to}(으)로 가는 길`}
            </div>
          )}
          {showProblem && <div className="hud-error band">{problem.text}</div>}
          {hud.blocking && <div className="hud-shield band">막는 중</div>}
          {hud.target && (
            <div className="hud-target band">
              <b>{hud.target.name}</b>
              <div className="hud-bar hp"><i style={{ width: `${Math.round((hud.target.hp / hud.target.maxHp) * 100)}%` }} /></div>
            </div>
          )}
          {view.current && (
            <PadButtons
              controls={view.current.controls} auto={hud.auto} talkTo={hud.npc?.name ?? null}
              onJump={() => view.current?.tapJump()} onAuto={() => view.current?.toggleAuto()} onTalk={() => view.current?.talk()}
            />
          )}
          <SkillBar hud={hud} playerClass={playerClass} onSkill={(slot) => view.current?.tapSkill(slot)} onPotion={() => view.current?.tapPotion()} />
          {/* The side panels sit where the tracker is; it steps aside while one is open. */}
          {panel !== "quests" && panel !== "skills" && (
            <QuestTracker
              bag={bag} seeking={hud.seeking} inVillage={inVillage}
              onSeek={(types) => view.current?.seekQuest(types)} onReport={() => view.current?.walkToNpc("elder")}
            />
          )}
          <ChatBox client={client} touch={touch} />
          {!touch && <div className="crosshair" />}
          {hud.hurt > 0 && <div className="hud-hurt" style={{ opacity: hud.hurt }} />}
          {hud.dead && (
            <div className="pain fallen">
              <div className="solid-panel world-panel">
                <p className="band">쓰러졌어요</p>
                <button type="button" className="brush-button" disabled={travelling} onClick={() => void client.respawn()}>
                  마을에서 다시 시작
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {menu && (
        <div className="menu-modal" onClick={() => setMenu(false)}>
          <div className="solid-panel world-panel" onClick={(e) => e.stopPropagation()}>
            <h2>메뉴</h2>
            <p className="note">WASD 이동 · 스페이스 점프 · 마우스 시점 · 좌클릭 공격 · 우클릭 막기 · 1~3 스킬 · Q 물약 · I 가방 · E 대화 · Enter 채팅 · 스킬 창에서 배운 스킬을 칸으로 끌어 넣기 · 칸을 아래로 끌면 자동 전투가 씀 · 퀘스트를 누르면 찾아감</p>
            <button type="button" className="brush-button" onClick={() => setMenu(false)}>계속하기</button>
            <button type="button" className="brush-button" onClick={() => setSettings(true)}>설정</button>
            <button type="button" className="brush-button" onClick={onExit}>메뉴로 나가기</button>
          </div>
        </div>
      )}
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}
      {panel === "bag" && (
        <BagPanel
          client={client} bag={bag} inVillage={inVillage} playerClass={playerClass} level={hud?.level ?? 1}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "shop" && <ShopPanel client={client} bag={bag} onClose={() => setPanel(null)} />}
      {panel === "smith" && <SmithPanel client={client} bag={bag} onClose={() => setPanel(null)} />}
      {panel === "skills" && <SkillPanel playerClass={playerClass} level={hud?.level ?? 1} onClose={() => setPanel(null)} />}
      {panel === "quests" && (
        <QuestLog
          bag={bag} inVillage={inVillage}
          onSeek={(types) => view.current?.seekQuest(types)} onReport={() => view.current?.walkToNpc("elder")}
          onClose={() => setPanel(null)}
        />
      )}
      {finished !== null && QUESTS[finished] && (
        <QuestCompleteBanner quest={QUESTS[finished]} inVillage={inVillage} onClose={() => setFinished(null)} />
      )}
      {panel === "quest" && (
        <QuestPanel client={client} bag={bag} onSeek={(types) => view.current?.seekQuest(types)} onClose={() => setPanel(null)} />
      )}
      {panel === "ranking" && <RankingPanel
        account={client.account} load={() => client.ranking()} loadDetail={(id) => client.rankDetail(id)} onClose={() => setPanel(null)}
      />}
      </div>
    </div>
  );
}
