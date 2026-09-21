import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameServer } from "@agent8/gameserver";
import type { Pose } from "./game/match/types";
import { RUINS, TILE_SIZE, parseLevel } from "./game/rules/levelLayout";
import { HostDirector } from "./net/hostDirector";
import { BotCrew } from "./net/botCrew";
import { MatchClient } from "./net/matchClient";
import { PRACTICE_ACCOUNT, PracticeSession } from "./net/practice";
import { Verse8Transport } from "./net/verse8Transport";
import { MatchScreen } from "./ui/MatchScreen";
import { ModelGallery, galleryEnabled } from "./ui/ModelGallery";
import { MainMenu } from "./ui/MainMenu";
import { MatchmakingPanel } from "./ui/MatchmakingPanel";
import type { ClientState } from "./net/matchClient";
import { loadStats } from "./net/account";
import { useAccount } from "./ui/useAccount";
import { useUiScale } from "./ui/useUiScale";
import { usePurchase } from "./ui/usePurchase";
import { myClass } from "./ui/profile";
import { useFriends } from "./ui/useFriends";
import { useParty } from "./ui/useParty";

// "matching" keeps the menu up while the lobby fills; the match screen loads once it starts.
type Mode = "title" | "practice" | "matching";
type Entry = "findMatch" | "joinPartyMatch";

const layout = parseLevel(RUINS, TILE_SIZE);
const ONLINE_AVAILABLE = Boolean(import.meta.env.VITE_AGENT8_VERSE);

export default function App() {
  const [mode, setMode] = useState<Mode>("title");
  const [entry, setEntry] = useState<Entry>("findMatch");
  // The last room your leader called you into, so a failed follow is not retried on every menu visit.
  const [followed, setFollowed] = useState<string | null>(null);
  const { server, connected } = useGameServer();
  useUiScale();
  const toTitle = useCallback(() => setMode("title"), []);
  const menuTransport = useMemo(
    () => (ONLINE_AVAILABLE && connected ? new Verse8Transport(server) : null),
    [connected, server],
  );
  const { view, failed, save, refresh } = useAccount(menuTransport);
  const purchase = usePurchase(menuTransport, refresh);
  const friends = useFriends(menuTransport);
  const party = useParty(menuTransport, mode === "title" ? "menu" : "match");
  const partyCall = party.view?.match && party.view.match.roomId !== followed ? party.view.match : null;
  const seat = useOnlineSeat(mode === "matching" ? entry : null);
  const leaveMatching = useCallback(() => {
    setMode("title");
  }, []);
  const started = seat.state?.phase === "playing" || seat.state?.phase === "ended";

  const rotate = <div className="rotate-hint">화면을 가로로 돌리면 더 편하게 즐길 수 있어요</div>;
  if (galleryEnabled()) return <ModelGallery />;
  if (mode === "practice") return <>{rotate}<PracticeMatch onExit={toTitle} /></>;
  if (mode === "matching" && seat.seat && started) {
    return <>{rotate}<OnlineMatch client={seat.seat.client} crew={seat.seat.crew} onExit={toTitle} /></>;
  }
  return (
    <>
    {rotate}
    <MainMenu
      account={menuTransport?.account ?? (connected ? server.account : PRACTICE_ACCOUNT)}
      nickname={view?.nickname ?? null}
      level={view?.level ?? null}
      owned={view?.owned ?? null}
      onBuy={purchase.buy}
      purchase={purchase.state}
      price={purchase.price}
      loadStats={menuTransport ? () => loadStats(menuTransport) : null}
      onSaveNickname={view ? save : null}
      accountFailed={failed}
      friends={friends.client}
      friendsView={friends.view}
      party={party.client}
      partyView={party.view}
      onPractice={() => setMode("practice")}
      onOnline={() => {
        setEntry("findMatch");
        setMode("matching");
      }}
      partyCall={partyCall}
      onFollowParty={() => {
        setFollowed(partyCall?.roomId ?? null);
        setEntry("joinPartyMatch");
        setMode("matching");
      }}
      onlineAvailable={ONLINE_AVAILABLE}
      matching={mode === "matching" ? (
        <MatchmakingPanel
          state={seat.state}
          account={menuTransport?.account ?? server.account}
          serverNow={() => seat.seat?.client.serverNow() ?? Date.now()}
          startedAt={seat.startedAt}
          onCancel={leaveMatching}
        />
      ) : null}
    />
    </>
  );
}

// Takes a seat in an online lobby and follows it. Null entry means "not matching": the seat is left.
function useOnlineSeat(entry: Entry | null) {
  const { server, connected } = useGameServer();
  const [seat, setSeat] = useState<{ client: MatchClient; crew: BotCrew } | null>(null);
  const [state, setState] = useState<ClientState | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  useEffect(() => {
    setSeat(null);
    setState(null);
    if (!entry || !connected) return;
    setStartedAt(Date.now());
    const transport = new Verse8Transport(server);
    const client = new MatchClient(transport);
    // Drives the lobby's fill bots whenever this client is the host.
    const crew = new BotCrew(client, transport, layout);
    const off = client.onChange(setState);
    let live = true;
    void client.join(entry).then(() => {
      if (live) setSeat({ client, crew });
    });
    return () => {
      live = false;
      off();
      crew.dispose();
      void client.leave();
      client.dispose();
    };
  }, [entry, connected, server]);

  return { seat, state, startedAt };
}

function PracticeMatch({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);

  useEffect(() => {
    const next = new PracticeSession(layout, { playerClass: myClass() });
    let live = true;
    void next.start().then(() => {
      if (live) setSession(next);
    });
    return () => {
      live = false;
      next.dispose();
    };
  }, []);

  const onFrame = useCallback((dt: number, pose: Pose | null) => session?.update(dt, pose), [session]);
  if (!session) return <div className="overlay">연습 방을 준비하는 중…</div>;
  return <MatchScreen client={session.human} onFrame={onFrame} onExit={onExit} tutorial />;
}

// The match itself, once the lobby it was found in has started.
function OnlineMatch({ client, crew, onExit }: { client: MatchClient; crew: BotCrew; onExit: () => void }) {
  const director = useMemo(() => new HostDirector(client, layout), [client]);
  const onFrame = useCallback((dt: number, pose: Pose | null) => {
    director.update(dt, pose);
    crew.update(dt);
  }, [director, crew]);
  return <MatchScreen client={client} onFrame={onFrame} onExit={onExit} />;
}
