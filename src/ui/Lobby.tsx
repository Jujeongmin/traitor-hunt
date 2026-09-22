import { useEffect, useRef, useState } from "react";
import { CHARACTERS_PER_WORLD } from "../game/account/characters";
import type { FriendsView } from "../game/account/friends";
import type { AccountView } from "../game/account/nickname";
import type { PartyView } from "../game/account/party";
import type { RankingView } from "../game/account/ranking";
import { readWorld } from "../game/account/worlds";
import { playMusic } from "../game/audio/music";
import { CLASS_LABEL, readClass, type PlayerClass } from "../game/combat/classes";
import { COSTUMES, costumeById, type Costume } from "../game/render/costumes";
import { MenuScene } from "../game/render/MenuScene";
import { nicknameProblem } from "../net/account";
import { loginState } from "../net/login";
import type { FriendsClient } from "../net/friends";
import { partyLineup, partyProblem, type PartyClient } from "../net/party";
import { GAME_TITLE } from "./brand";
import { ClassPanel } from "./ClassPanel";
import { FriendsPanel } from "./FriendsPanel";
import { NicknamePanel } from "./NicknamePanel";
import { RankingPanel } from "./RankingPanel";
import { SettingsPanel } from "./SettingsPanel";
import { Wardrobe } from "./Wardrobe";
import { WorldPicker } from "./WorldPicker";

interface LobbyProps {
  account: string;
  // Your account on the server; null while offline or loading.
  view: AccountView | null;
  accountFailed: boolean;
  // Starting needs the Verse8 server.
  online: boolean;
  onPickWorld: (world: string) => Promise<void>;
  checkName: (name: string) => Promise<boolean>;
  onCreate: (name: string, playerClass: string, costume: string) => Promise<void>;
  onSelect: (id: string) => Promise<void>;
  loadRanking: (() => Promise<RankingView>) | null;
  // Opens Verse8's purchase dialog; null when there is no shop.
  onBuy: (() => void) | null;
  purchase: "idle" | "confirming" | "late";
  price: number;
  friends: FriendsClient | null;
  friendsView: FriendsView | null;
  party: PartyClient | null;
  partyView: PartyView | null;
  // Into the world with the active character.
  onStart: () => void;
  // Back from the world: straight to your characters, not the title.
  returning: boolean;
}

// title: the logo over the village, tap to go on. world: which server. characters: yours on that
// server, to play or to make another. class, name, look: making a new one.
type Step = "title" | "world" | "characters" | "class" | "name" | "look";
type Sheet = "none" | "settings" | "ranking";

export function Lobby({
  account, view, accountFailed, online, onPickWorld, checkName, onCreate, onSelect, loadRanking, onBuy, purchase, price,
  friends, friendsView, party, partyView, onStart, returning,
}: LobbyProps) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const [loading, setLoading] = useState(0);
  const [step, setStep] = useState<Step>(returning ? "characters" : "title");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  // The character being made: its class, name and look until it is saved.
  const [draftClass, setDraftClass] = useState<PlayerClass | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCostume, setDraftCostume] = useState<Costume>(COSTUMES[0]);
  const [creating, setCreating] = useState(false);
  // A guest's characters live on an address made for this visit only.
  const [guest] = useState(() => loginState() === "guest");

  const active = view?.active ?? null;
  const characters = view?.characters ?? [];
  const making = step === "class" || step === "name" || step === "look";
  // Who stands in the square: the character being made, else the one you play.
  const shownClass: PlayerClass = (making ? draftClass : readClass(active?.playerClass)) ?? "warrior";
  const shownCostume = making ? draftCostume : costumeById(active?.costume) ?? COSTUMES[0];

  useEffect(() => playMusic("menu"), []);

  useEffect(() => {
    const container = stage.current;
    if (!container) return;
    const next = new MenuScene(container);
    scene.current = next;
    void next.start((done, total) => setLoading(done / total)).then(() => setLoading(1));
    return () => {
      scene.current = null;
      next.dispose();
    };
  }, []);

  // The row of classes while picking one (and behind the title for a newcomer); otherwise the
  // character in the square.
  useEffect(() => {
    scene.current?.setMode(step === "class" || (step === "title" && !active) ? "lineup" : "party");
    scene.current?.setPicked(step === "class" ? draftClass : null);
  }, [step, draftClass, active, loading]);
  useEffect(() => {
    scene.current?.setWardrobe(step === "look");
  }, [step]);
  useEffect(() => {
    const me = { account, name: making ? draftName || "새 캐릭터" : active?.name ?? "", costume: shownCostume, playerClass: shownClass };
    scene.current?.setParty(step === "characters" && !active ? [] : partyLineup(me, making ? null : partyView));
  }, [account, making, draftName, active, shownCostume, shownClass, partyView, step, loading]);

  const invite = partyView?.invites[0] ?? null;
  const answer = async (accept: boolean) => {
    if (!party || !invite) return;
    setInviteProblem(null);
    try {
      if (accept) await party.accept(invite.account);
      else await party.decline(invite.account);
    } catch (error) {
      setInviteProblem(partyProblem(error));
      await party.decline(invite.account).catch(() => undefined);
    }
  };

  // Tap anywhere on the title to go on: the server comes first.
  const tapTitle = () => {
    if (loading < 1) return;
    if (!online) {
      setNotice("게임은 Verse8 서버에 연결되어야 시작할 수 있어요.");
      return;
    }
    if (accountFailed) {
      setNotice("계정 정보를 불러오지 못했어요. 새로고침해 주세요.");
      return;
    }
    if (!view) {
      setNotice("계정 정보를 불러오는 중…");
      return;
    }
    setNotice(null);
    setStep("world");
  };

  const startMaking = () => {
    setDraftClass(null);
    setDraftName("");
    setDraftCostume(COSTUMES[0]);
    setNotice(null);
    setStep("class");
  };

  const finishMaking = async () => {
    if (!draftClass || creating) return;
    setCreating(true);
    setNotice(null);
    try {
      await onCreate(draftName, draftClass, draftCostume.id);
      setStep("characters");
    } catch (error) {
      setNotice(nicknameProblem(error));
      // A name taken while you dressed goes back to the name step.
      setStep("name");
    } finally {
      setCreating(false);
    }
  };

  const start = () => {
    if (leaving || !active) return;
    setLeaving(true);
    if (scene.current) scene.current.enter(onStart);
    else onStart();
  };

  const worldName = readWorld(view?.world)?.name ?? readWorld("w1")?.name ?? "";

  return (
    <div className="main-menu">
      <div
        className="menu-stage"
        ref={stage}
        onClick={(e) => {
          if (step === "title") tapTitle();
          if (step === "class") {
            const c = scene.current?.classAt(e.clientX, e.clientY) ?? null;
            if (c) setDraftClass(c);
          }
        }}
      />
      <div className="ui">
        {loading < 1 && <div className="menu-loading band">마을을 불러오는 중… {Math.round(loading * 100)}%</div>}

        {step === "title" && (
          <div className="title-screen" onClick={tapTitle}>
            <h1 className="game-title">{GAME_TITLE}</h1>
            {loading >= 1 && <p className="tap-to-start">화면을 눌러 시작</p>}
            {notice && <p className="title-notice band">{notice}</p>}
          </div>
        )}

        {step === "characters" && (
          <div className="menu-corner">
            <button type="button" className="brush-button small" onClick={() => setFriendsOpen((v) => !v)}>
              친구{(friendsView?.incoming.length ?? 0) > 0 && <span className="badge">{friendsView?.incoming.length}</span>}
            </button>
            <button type="button" className="brush-button small" onClick={() => setSheet("settings")}>설정</button>
          </div>
        )}

        {invite && (
          <div className="party-invite band">
            <span><b>{invite.nickname ?? invite.account}</b>님이 파티에 초대했어요</span>
            <button type="button" className="text-button" onClick={() => void answer(true)}>수락</button>
            <button type="button" className="text-button" onClick={() => void answer(false)}>거절</button>
          </div>
        )}
        {!invite && inviteProblem && <div className="party-invite band">{inviteProblem}</div>}

        {step === "world" && (
          <WorldPicker
            current={view?.world ?? null}
            onPick={async (id) => {
              await onPickWorld(id);
              setStep("characters");
            }}
            onClose={() => setStep("title")}
          />
        )}

        {step === "characters" && (
          <nav className="menu-left character-select">
            <h1 className="game-title small">{GAME_TITLE}</h1>
            <p className="note">{worldName} · 캐릭터 {characters.length}/{CHARACTERS_PER_WORLD}</p>
            <ul className="character-list">
              {characters.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`character-card${c.id === active?.id ? " picked" : ""}`}
                    onClick={() => void onSelect(c.id)}
                  >
                    <b>{c.name}</b>
                    <span>Lv {c.level.level} · {CLASS_LABEL[c.playerClass]}</span>
                  </button>
                </li>
              ))}
              {characters.length < CHARACTERS_PER_WORLD && (
                <li>
                  <button type="button" className="character-card new" onClick={startMaking}>+ 캐릭터 생성</button>
                </li>
              )}
            </ul>
            <button type="button" className="brush-button" onClick={start} disabled={leaving || !active}>게임 시작</button>
            <button type="button" className="brush-button" onClick={() => setSheet("ranking")}>랭킹</button>
            <button type="button" className="brush-button" onClick={() => setStep("world")}>서버 바꾸기</button>
            {view && !view.owned && onBuy && (
              <button type="button" className="brush-button buy-button" onClick={onBuy} disabled={purchase === "confirming"}>
                정식판 구매 ({price} VX)
              </button>
            )}
            {guest && <p className="note guest-note">로그인하지 않은 상태예요. 이대로 만든 캐릭터는 다음에 접속하면 불러올 수 없어요. Verse8에 로그인한 뒤 시작해 주세요.</p>}
            {!active && <p className="note">캐릭터를 만들어 모험을 시작하세요.</p>}
            {view && !view.owned && <p className="note">무료로 마을과 숲 필드 1을 즐길 수 있어요. 정식판은 숲 필드 2와 보스 구역, 그리고 마법사·성직자·도적·무도가 직업을 엽니다.</p>}
            {purchase === "confirming" && <p className="note">결제를 확인하는 중…</p>}
            {purchase === "late" && <p className="note">결제 확인이 늦어지고 있어요. 잠시 뒤 새로고침해 주세요.</p>}
          </nav>
        )}

        {step === "class" && (
          <ClassPanel
            picked={draftClass}
            onPick={setDraftClass}
            onBack={() => setStep("characters")}
            owned={view?.owned === true}
            onBuy={onBuy}
            onConfirm={(c) => {
              setDraftClass(c);
              setStep("name");
            }}
          />
        )}

        {step === "name" && (
          <NicknamePanel
            current={draftName}
            isFree={checkName}
            onNext={(name) => {
              setDraftName(name);
              setStep("look");
            }}
            onClose={() => setStep("class")}
          />
        )}
        {step === "name" && notice && <div className="hud-error band">{notice}</div>}

        {step === "look" && (
          <Wardrobe
            costume={draftCostume}
            onPick={setDraftCostume}
            onSpin={(r) => scene.current?.spin(r)}
            onClose={() => setStep("name")}
            onStart={() => void finishMaking()}
            busy={creating}
          />
        )}

        {friendsOpen && (
          <FriendsPanel
            onClose={() => setFriendsOpen(false)}
            client={friends}
            view={friendsView}
            account={account}
            party={party}
            partyView={partyView}
            hasCharacter={!!active}
          />
        )}
        {sheet === "settings" && <SettingsPanel onClose={() => setSheet("none")} />}
        {sheet === "ranking" && <RankingPanel account={account} load={loadRanking} onClose={() => setSheet("none")} />}
      </div>
    </div>
  );
}
