import { useEffect, useMemo, useState } from "react";
import { useGameServer } from "@agent8/gameserver";
import { readClass } from "./game/combat/classes";
import { costumeById } from "./game/render/costumes";
import { loadRanking } from "./net/account";
import { Verse8Transport } from "./net/verse8Transport";
import { devLocalTransport } from "./net/devLocal";
import { WorldClient } from "./net/worldClient";
import { Lobby } from "./ui/Lobby";
import { ModelGallery, galleryEnabled } from "./ui/ModelGallery";
import { WorldScreen } from "./ui/WorldScreen";
import { myClass, myCostume, setMyClass, setMyCostume } from "./ui/profile";
import { useAccount } from "./ui/useAccount";
import { useFriends } from "./ui/useFriends";
import { useParty } from "./ui/useParty";
import { usePurchase } from "./ui/usePurchase";
import { useUiScale } from "./ui/useUiScale";

const ONLINE_AVAILABLE = Boolean(import.meta.env.VITE_AGENT8_VERSE);
const DEV_LOCAL = devLocalTransport();

export default function App() {
  const [inWorld, setInWorld] = useState(false);
  const [returning, setReturning] = useState(false);
  const { server, connected } = useGameServer();
  useUiScale();
  const transport = useMemo(
    () => DEV_LOCAL ?? (ONLINE_AVAILABLE && connected ? new Verse8Transport(server) : null),
    [connected, server],
  );
  const { view, failed, save, pickWorld, refresh } = useAccount(transport);
  const purchase = usePurchase(transport, refresh);
  const friends = useFriends(transport);
  const party = useParty(transport, inWorld ? "world" : "menu");
  const world = useMemo(() => (transport ? new WorldClient(transport) : null), [transport]);

  // The character saved on the server wins over whatever this browser remembered.
  useEffect(() => {
    const saved = readClass(view?.playerClass);
    if (saved && saved !== myClass()) setMyClass(saved);
    const look = costumeById(view?.costume);
    if (look && look.id !== myCostume().id) setMyCostume(look);
  }, [view?.playerClass, view?.costume]);

  // Losing the server takes you back to the menu.
  useEffect(() => {
    if (!world) setInWorld(false);
  }, [world]);

  const rotate = <div className="rotate-hint">화면을 가로로 돌리면 더 편하게 즐길 수 있어요</div>;
  if (galleryEnabled()) return <ModelGallery />;
  if (inWorld && world && view) {
    return (
      <>
        {rotate}
        <WorldScreen
          client={world}
          playerClass={myClass()}
          costume={myCostume()}
          name={view.nickname ?? ""}
          owned={view.owned}
          onExit={() => {
            setInWorld(false);
            setReturning(true);
            void refresh();
          }}
        />
      </>
    );
  }
  return (
    <>
      {rotate}
      <Lobby
        account={transport?.account ?? (connected ? server.account : "")}
        view={view}
        accountFailed={failed}
        online={!!transport}
        onSaveNickname={view ? save : null}
        onPickWorld={pickWorld}
        loadRanking={transport ? () => loadRanking(transport) : null}
        onBuy={purchase.buy}
        purchase={purchase.state}
        price={purchase.price}
        friends={friends.client}
        friendsView={friends.view}
        party={party.client}
        partyView={party.view}
        onStart={() => setInWorld(true)}
        returning={returning && !!view}
      />
    </>
  );
}
