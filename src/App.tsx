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
import { useAccount } from "./ui/useAccount";
import { useFriends } from "./ui/useFriends";
import { useParty } from "./ui/useParty";

type Mode = "title" | "practice" | "online";
type Entry = "findMatch" | "joinPartyMatch";

const layout = parseLevel(RUINS, TILE_SIZE);
const ONLINE_AVAILABLE = Boolean(import.meta.env.VITE_AGENT8_VERSE);

export default function App() {
  const [mode, setMode] = useState<Mode>("title");
  const [entry, setEntry] = useState<Entry>("findMatch");
  // The last room your leader called you into, so a failed follow is not retried on every menu visit.
  const [followed, setFollowed] = useState<string | null>(null);
  const { server, connected } = useGameServer();
  const toTitle = useCallback(() => setMode("title"), []);
  const menuTransport = useMemo(
    () => (ONLINE_AVAILABLE && connected ? new Verse8Transport(server) : null),
    [connected, server],
  );
  const { view, failed, save } = useAccount(menuTransport);
  const friends = useFriends(menuTransport);
  const party = useParty(menuTransport, mode === "title" ? "menu" : "match");
  const partyCall = party.view?.match && party.view.match.roomId !== followed ? party.view.match : null;
  if (galleryEnabled()) return <ModelGallery />;
  if (mode === "practice") return <PracticeMatch onExit={toTitle} />;
  if (mode === "online") return <OnlineMatch entry={entry} onExit={toTitle} />;
  return (
    <MainMenu
      account={menuTransport?.account ?? (connected ? server.account : PRACTICE_ACCOUNT)}
      nickname={view?.nickname ?? null}
      level={view?.level ?? null}
      onSaveNickname={view ? save : null}
      accountFailed={failed}
      friends={friends.client}
      friendsView={friends.view}
      party={party.client}
      partyView={party.view}
      onPractice={() => setMode("practice")}
      onOnline={() => {
        setEntry("findMatch");
        setMode("online");
      }}
      partyCall={partyCall}
      onFollowParty={() => {
        setFollowed(partyCall?.roomId ?? null);
        setEntry("joinPartyMatch");
        setMode("online");
      }}
      onlineAvailable={ONLINE_AVAILABLE}
    />
  );
}

function PracticeMatch({ onExit }: { onExit: () => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);

  useEffect(() => {
    const next = new PracticeSession(layout);
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
  return <MatchScreen client={session.human} onFrame={onFrame} onExit={onExit} />;
}

function OnlineMatch({ entry, onExit }: { entry: Entry; onExit: () => void }) {
  const { server, connected } = useGameServer();
  const [seat, setSeat] = useState<{ client: MatchClient; crew: BotCrew } | null>(null);
  const client = seat?.client ?? null;

  useEffect(() => {
    if (!connected) return;
    const transport = new Verse8Transport(server);
    const next = new MatchClient(transport);
    // Drives the lobby's fill bots whenever this client is the host.
    const crew = new BotCrew(next, transport, layout);
    let live = true;
    void next.join(entry).then(() => {
      if (live) setSeat({ client: next, crew });
    });
    return () => {
      live = false;
      crew.dispose();
      void next.leave();
      next.dispose();
    };
  }, [connected, server, entry]);

  const director = useMemo(() => (client ? new HostDirector(client, layout) : null), [client]);
  const onFrame = useCallback((dt: number, pose: Pose | null) => {
    director?.update(dt, pose);
    seat?.crew.update(dt);
  }, [director, seat]);
  if (!client) return <div className="overlay">{connected ? "매치를 찾는 중…" : "Verse8 서버에 연결하는 중…"}</div>;
  return <MatchScreen client={client} onFrame={onFrame} onExit={onExit} />;
}
