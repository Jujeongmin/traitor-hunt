import { useEffect, useRef, useState } from "react";
import type { FriendsView } from "../game/account/friends";
import type { LevelView } from "../game/account/level";
import type { StatsView } from "../game/account/ranking";
import type { PartyView } from "../game/account/party";
import { MenuScene } from "../game/render/MenuScene";
import { ownName } from "../game/render/names";
import type { FriendsClient } from "../net/friends";
import { partyLineup, partyProblem, type PartyClient } from "../net/party";
import { FriendsPanel } from "./FriendsPanel";
import { NicknamePanel } from "./NicknamePanel";
import { CostumePanel } from "./CostumePanel";
import { StatsPanel } from "./StatsPanel";
import { myCostume, onMyCostume, setMyCostume } from "./profile";
import { SettingsPanel } from "./SettingsPanel";

interface MainMenuProps {
  account: string;
  // Your server nickname; null while offline, loading, or not yet picked.
  nickname: string | null;
  // What your finished matches add up to; null while offline or loading.
  level: LevelView | null;
  // Reads your record and the board; null while offline.
  loadStats: (() => Promise<StatsView>) | null;
  // Null until the server account has loaded.
  onSaveNickname: ((nickname: string) => Promise<void>) | null;
  accountFailed: boolean;
  // Null while offline.
  friends: FriendsClient | null;
  friendsView: FriendsView | null;
  party: PartyClient | null;
  partyView: PartyView | null;
  // Set when your party leader started a match; the menu plays its exit and calls onFollowParty.
  partyCall: { roomId: string } | null;
  onFollowParty: () => void;
  onPractice: () => void;
  onOnline: () => void;
  onlineAvailable: boolean;
}

type Sheet = "none" | "settings" | "help" | "costume" | "stats";

export function MainMenu({
  account, nickname, level, loadStats, onSaveNickname, accountFailed, friends, friendsView, party, partyView, partyCall, onFollowParty,
  onPractice, onOnline, onlineAvailable,
}: MainMenuProps) {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const [loading, setLoading] = useState(0);
  const [costume, setCostume] = useState(myCostume());
  const [sheet, setSheet] = useState<Sheet>("none");
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // Quick start was pressed without a nickname: start as soon as one is saved.
  const [startAfterName, setStartAfterName] = useState(false);
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);
  const name = nickname ?? ownName(account);
  const members = partyView?.party?.members ?? [];
  const inParty = members.length > 0;
  const leading = partyView?.party?.leader === account;
  const partyBusy = members.some((m) => m.account !== account && (!m.online || m.activity !== "menu"));
  // A nickname is asked for when you start, not before: practice and the menu work without one.
  const onlineReady = onlineAvailable && !!onSaveNickname && (!inParty || (leading && !partyBusy));
  const requests = friendsView?.incoming.length ?? 0;
  const onlineNote = !onlineAvailable
    ? "빠른 시작은 Verse8 서버를 연결한 뒤 열립니다."
    : accountFailed
      ? "계정 정보를 불러오지 못했습니다. 새로고침해 주세요."
      : !onSaveNickname
        ? "계정 정보를 불러오는 중…"
        : inParty && !leading
          ? "파티장이 빠른 시작을 누르면 함께 들어갑니다."
          : inParty && partyBusy
            ? "파티원이 아직 게임 중이에요."
            : null;

  useEffect(() => onMyCostume(setCostume), []);

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

  useEffect(() => {
    scene.current?.setParty(partyLineup({ account, name, costume }, partyView));
  }, [account, name, costume, partyView, loading]);

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

  const go = (start: () => void) => {
    if (leaving) return;
    setLeaving(true);
    if (scene.current) scene.current.enter(start);
    else start();
  };

  const quickStart = () => {
    if (nickname !== null) {
      go(onOnline);
      return;
    }
    setStartAfterName(true);
    setRenaming(true);
  };

  useEffect(() => {
    if (partyCall) go(onFollowParty);
    // Once per call: keyed on the room, and `leaving` stops repeats.
  }, [partyCall?.roomId]);

  return (
    <div className="main-menu">
      <div className="menu-stage" ref={stage} />
      {loading < 1 && <div className="menu-loading band">유적을 여는 중… {Math.round(loading * 100)}%</div>}

      <div className="menu-profile band">
        <span className="menu-level" title={level ? `경험치 ${level.into} / ${level.need}` : undefined}>
          Lv {level?.level ?? 1}
          {level && (
            <span className="level-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((level.into / level.need) * 100)}%` }} />
            </span>
          )}
        </span>
        {onSaveNickname ? (
          <button type="button" className="menu-name name-button" title="닉네임 바꾸기" onClick={() => setRenaming(true)}>
            {name}
          </button>
        ) : (
          <span className="menu-name">{name}</span>
        )}
      </div>

      {invite && (
        <div className="party-invite band">
          <span><b>{invite.nickname ?? invite.account}</b>님이 파티에 초대했어요</span>
          <button type="button" className="text-button" onClick={() => void answer(true)}>수락</button>
          <button type="button" className="text-button" onClick={() => void answer(false)}>거절</button>
        </div>
      )}
      {!invite && inviteProblem && <div className="party-invite band">{inviteProblem}</div>}

      <div className="menu-corner">
        <button type="button" className="brush-button small" onClick={() => setFriendsOpen((v) => !v)}>
          친구{requests > 0 && <span className="badge">{requests}</span>}
        </button>
        <button type="button" className="brush-button small" onClick={() => setSheet("settings")}>설정</button>
      </div>

      <nav className="menu-left">
        <h1>TRAITOR HUNT</h1>
        <button type="button" className="brush-button" onClick={quickStart} disabled={!onlineReady || leaving}>
          {inParty ? `빠른 시작 (파티 ${members.length}명)` : "빠른 시작"}
        </button>
        <button type="button" className="brush-button" onClick={() => go(onPractice)} disabled={leaving}>연습 (봇 3명)</button>
        <button type="button" className="brush-button" onClick={() => setSheet("costume")}>코스튬</button>
        <button type="button" className="brush-button" onClick={() => setSheet("stats")}>전적 · 랭킹</button>
        <button type="button" className="brush-button" onClick={() => setSheet("help")}>게임 방법</button>
        {onlineNote && <p className="note">{onlineNote}</p>}
      </nav>

      {friendsOpen && <FriendsPanel
          onClose={() => setFriendsOpen(false)}
          client={friends}
          view={friendsView}
          account={account}
          party={party}
          partyView={partyView}
          needsNickname={!!onSaveNickname && nickname === null}
          onPickNickname={() => setRenaming(true)}
        />}

      {onSaveNickname && renaming && (
        <NicknamePanel
          current={nickname}
          purpose={startAfterName ? "start" : nickname === null ? "first" : "rename"}
          onSave={async (next) => {
            await onSaveNickname(next);
            if (startAfterName) go(onOnline);
          }}
          onClose={() => {
            setRenaming(false);
            setStartAfterName(false);
          }}
        />
      )}

      {sheet === "settings" && <SettingsPanel onClose={() => setSheet("none")} />}
      {sheet === "stats" && (
        <StatsPanel account={account} load={loadStats} onClose={() => setSheet("none")} />
      )}
      {sheet === "costume" && (
        <CostumePanel
          current={costume}
          online={!!onSaveNickname}
          onPick={setMyCostume}
          onClose={() => setSheet("none")}
        />
      )}
      {sheet === "help" && (
        <div className="menu-modal" onClick={() => setSheet("none")}>
          <div className="dark-panel help-panel" onClick={(e) => e.stopPropagation()}>
            <h2>게임 방법</h2>
            <p>네 명이 봉인된 유적에 갇혔습니다. 열쇠를 모으고 장치를 작동해 문을 열고, 제단의 보스를 쓰러뜨린 뒤 탈출하세요.</p>
            <p>그중 한 명은 배신자입니다. 배신자는 총으로 동료를 쏠 수 없고, 몬스터에 빙의해서만 공격합니다.</p>
            <p>문이 열릴 때마다 투표 발판이 떨어집니다. 30초 안에 의심 가는 사람의 발판에 서세요. 배신자를 맞히면 빙의가 봉인되고, 틀리면 그 사람이 20초 동안 묶입니다.</p>
            <p className="note">WASD 이동 · 스페이스 점프 · 마우스 조준 · 클릭 사격 · E 상호작용 · Q 빙의(배신자)</p>
            <button type="button" className="text-button" onClick={() => setSheet("none")}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
