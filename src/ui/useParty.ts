import { useEffect, useState } from "react";
import { HEARTBEAT_MS } from "../game/account/friends";
import type { Activity, PartyView } from "../game/account/party";
import { PartyClient } from "../net/party";
import type { MatchTransport } from "../net/transport";
import { onMyClass, onMyCostume } from "./profile";

// Lives for the whole app like useFriends; also tells the server when you change your class or look.
export function useParty(transport: MatchTransport | null, activity: Activity) {
  const [client, setClient] = useState<PartyClient | null>(null);
  const [view, setView] = useState<PartyView | null>(null);

  useEffect(() => {
    setClient(null);
    setView(null);
    if (!transport) return;
    const next = new PartyClient(transport);
    const off = next.onChange(setView);
    setClient(next);
    const offCostume = onMyCostume((c) => void next.setCostume(c.id).catch(() => undefined));
    const offClass = onMyClass((c) => void next.setClass(c).catch(() => undefined));
    void next.start().catch(() => undefined);
    const beat = window.setInterval(() => void next.sync().catch(() => undefined), HEARTBEAT_MS);
    return () => {
      window.clearInterval(beat);
      offCostume();
      offClass();
      off();
      next.dispose();
    };
  }, [transport]);

  useEffect(() => {
    void client?.setActivity(activity).catch(() => undefined);
  }, [client, activity]);

  return { client, view };
}
