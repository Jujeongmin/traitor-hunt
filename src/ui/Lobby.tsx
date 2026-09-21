import { useEffect, useRef, useState } from "react";
import type { FriendsView } from "../game/account/friends";
import type { AccountView } from "../game/account/nickname";
import type { PartyView } from "../game/account/party";
import type { RankingView } from "../game/account/ranking";
import { readWorld } from "../game/account/worlds";
import { playMusic } from "../game/audio/music";
import { CLASS_LABEL, readClass, type PlayerClass } from "../game/combat/classes";
import { MenuScene } from "../game/render/MenuScene";
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
import { myClass, myCostume, onMyClass, onMyCostume, setMyClass, setMyCostume } from "./profile";

interface LobbyProps {
  account: string;
  // Your account on the server; null while offline or loading.
  view: AccountView | null;
  accountFailed: boolean;
  // Starting needs the Verse8 server.
  online: boolean;
  onSaveNickname: ((nickname: string) => Promise<void>) | null;
  onPickWorld: (world: string) => Promise<void>;
  loadRanking: (() => Promise<RankingView>) | null;
  // Opens Verse8's purchase dialog; null when there is no shop.
  onBuy: (() => void) | null;
  purchase: "idle" | "confirming" | "late";
  price: number;
  friends: FriendsClient | null;
  friendsView: FriendsView | null;
  party: PartyClient | null;
  partyView: PartyView | null;
  // Into the world.
  onStart: () => void;
}

// title: the logo over the village, tap to go on. world: which server. class, name, look: making a
// new character. ready: your character, and the way into the world.
type Step = "title" | "world" | "class" | "name" | "look" | "ready";
type Sheet = "none" | "settings" | "ranking" | "wardrobe";

export function Lobby({
  account, view, accountFailed, online, onSaveNickname, onPickWorld, loadRanking, onBuy, purchase, price,
  friends, friendsView, party, partyView, onStart,
}: LobbyProps) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const [loading, setLoading] = useState(0);
  const [step, setStep] = useState<Step>("title");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<PlayerClass | null>(null);
  const [costume, setCostume] = useState(myCostume());
  const [playerClass, setPlayerClass] = useState(myClass());
  const [leaving, setLeaving] = useState(false);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);

  const hasCharacter = !!view && view.nickname !== null && view.playerClass !== null;
  const name = view?.nickname ?? "";
  const dressing = step === "look" || sheet === "wardrobe";

  useEffect(() => onMyCostume(setCostume), []);
  useEffect(() => onMyClass(setPlayerClass), []);
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

  // The row of classes while picking one; otherwise you (and your party) in the square.
  useEffect(() => {
    scene.current?.setMode(step === "class" || (step === "title" && !hasCharacter) ? "lineup" : "party");
    scene.current?.setPicked(step === "class" ? picked : null);
  }, [step, picked, hasCharacter, loading]);
  useEffect(() => {
    scene.current?.setWardrobe(dressing);
  }, [dressing]);
  useEffect(() => {
    scene.current?.setParty(partyLineup({ account, name: name || "나", costume, playerClass }, partyView));
  }, [account, name, costume, playerClass, partyView, loading]);

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

  const start = () => {
    if (leaving) return;
    setLeaving(true);
    if (scene.current) scene.current.enter(onStart);
    else onStart();
  };

  const classOf = readClass(view?.playerClass) ?? playerClass;
  const worldName = readWorld(view?.world)?.name ?? null;

  return (
    <div className="main-menu">
      <div
        className="menu-stage"
        ref={stage}
        onClick={(e) => {
          if (step === "title") tapTitle();
          if (step === "class") {
            const c = scene.current?.classAt(e.clientX, e.clientY) ?? null;
            if (c) setPicked(c);
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

        {step !== "title" && !dressing && step !== "class" && (
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
              setStep(hasCharacter ? "ready" : "class");
            }}
            onClose={() => setStep("title")}
          />
        )}

        {step === "class" && (
          <ClassPanel
            picked={picked}
            onPick={setPicked}
            onBack={() => setStep("world")}
            onConfirm={(c) => {
              setMyClass(c);
              setStep(view?.nickname ? "look" : "name");
            }}
          />
        )}

        {step === "name" && onSaveNickname && (
          <NicknamePanel
            current={view?.nickname ?? null}
            purpose="start"
            onSave={async (next) => {
              await onSaveNickname(next);
              setStep("look");
            }}
            onClose={() => setStep("class")}
          />
        )}

        {(step === "look" || sheet === "wardrobe") && (
          <Wardrobe
            costume={costume}
            online={online}
            onPick={setMyCostume}
            onSpin={(r) => scene.current?.spin(r)}
            onClose={() => (step === "look" ? setStep("class") : setSheet("none"))}
            onStart={step === "look" ? start : undefined}
          />
        )}

        {step === "ready" && sheet !== "wardrobe" && (
          <nav className="menu-left">
            <h1 className="game-title small">{GAME_TITLE}</h1>
            <div className="ready-card band">
              <b>{name}</b>
              <span>Lv {view?.level.level ?? 1} · {CLASS_LABEL[classOf]}</span>
              {worldName && <span className="note">{worldName}</span>}
            </div>
            <button type="button" className="brush-button" onClick={start} disabled={leaving}>게임 시작</button>
            <button type="button" className="brush-button" onClick={() => setSheet("wardrobe")}>외형 바꾸기</button>
            <button type="button" className="brush-button" onClick={() => setSheet("ranking")}>랭킹</button>
            <button type="button" className="brush-button" onClick={() => setStep("world")}>서버 바꾸기</button>
            {view && !view.owned && onBuy && (
              <button type="button" className="brush-button buy-button" onClick={onBuy} disabled={purchase === "confirming"}>
                정식판 구매 ({price} VX)
              </button>
            )}
            {view && !view.owned && <p className="note">무료로 마을과 숲 필드 1을 즐길 수 있어요. 정식판은 숲 필드 2와 보스 구역을 엽니다.</p>}
            {purchase === "confirming" && <p className="note">결제를 확인하는 중…</p>}
            {purchase === "late" && <p className="note">결제 확인이 늦어지고 있어요. 잠시 뒤 새로고침해 주세요.</p>}
          </nav>
        )}

        {friendsOpen && (
          <FriendsPanel
            onClose={() => setFriendsOpen(false)}
            client={friends}
            view={friendsView}
            account={account}
            party={party}
            partyView={partyView}
            needsNickname={!!onSaveNickname && !view?.nickname}
            onPickNickname={() => setRenaming(true)}
          />
        )}
        {onSaveNickname && renaming && (
          <NicknamePanel
            current={view?.nickname ?? null}
            purpose={view?.nickname ? "rename" : "first"}
            onSave={onSaveNickname}
            onClose={() => setRenaming(false)}
          />
        )}
        {sheet === "settings" && <SettingsPanel onClose={() => setSheet("none")} />}
        {sheet === "ranking" && <RankingPanel account={account} load={loadRanking} onClose={() => setSheet("none")} />}
      </div>
    </div>
  );
}
