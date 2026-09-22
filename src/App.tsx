import { useEffect, useMemo, useState } from "react";
import { useGameServer } from "@agent8/gameserver";
import { readClass } from "./game/combat/classes";
import { COSTUMES, costumeById } from "./game/render/costumes";
import { loadRanking } from "./net/account";
import { Verse8Transport } from "./net/verse8Transport";
import { devLocalTransport } from "./net/devLocal";
import { syncControls } from "./net/controlsSync";
import { WorldClient } from "./net/worldClient";
import { Lobby } from "./ui/Lobby";
import { ModelGallery, galleryEnabled } from "./ui/ModelGallery";
import { WorldScreen } from "./ui/WorldScreen";
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
  const { server, connected, joinRoom, leaveRoom } = useGameServer();
  useUiScale();
  const transport = useMemo(
    () => DEV_LOCAL ?? (ONLINE_AVAILABLE && connected ? new Verse8Transport(server, { joinRoom, leaveRoom }) : null),
    [connected, server, joinRoom, leaveRoom],
  );
  const { view, failed, pickWorld, checkName, create, select, refresh } = useAccount(transport);
  const purchase = usePurchase(transport, refresh);
  const friends = useFriends(transport);
  const party = useParty(transport, inWorld ? "world" : "menu");
  const world = useMemo(() => (transport ? new WorldClient(transport) : null), [transport]);

  // The bar's set-up follows the account.
  useEffect(() => (transport ? syncControls(transport) : undefined), [transport]);

  // Losing the server takes you back to the menu.
  useEffect(() => {
    if (!world) setInWorld(false);
  }, [world]);

  const rotate = <div className="rotate-hint">화면을 가로로 돌리면 더 편하게 즐길 수 있어요</div>;
  if (galleryEnabled()) return <ModelGallery />;
  const active = view?.active ?? null;
  if (inWorld && world && view && active) {
    return (
      <>
        {rotate}
        <WorldScreen
          client={world}
          playerClass={readClass(active.playerClass) ?? "warrior"}
          costume={costumeById(active.costume) ?? COSTUMES[0]}
          name={active.name}
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
        onPickWorld={pickWorld}
        checkName={checkName}
        onCreate={create}
        onSelect={select}
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
