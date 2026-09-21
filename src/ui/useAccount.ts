import { useCallback, useEffect, useState } from "react";
import type { AccountView } from "../game/account/nickname";
import { createCharacter, loadAccount, nameFree, saveWorld, selectCharacter } from "../net/account";
import type { MatchTransport } from "../net/transport";

// Your server-side account while on the menu; null transport means offline.
export function useAccount(transport: MatchTransport | null) {
  const [view, setView] = useState<AccountView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setView(null);
    setFailed(false);
    if (!transport) return;
    let live = true;
    loadAccount(transport).then(
      (next) => live && setView(next),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [transport]);

  const online = useCallback(() => {
    if (!transport) throw new Error("offline");
    return transport;
  }, [transport]);

  const pickWorld = useCallback(async (world: string) => {
    setView(await saveWorld(online(), world));
  }, [online]);

  const checkName = useCallback((name: string) => nameFree(online(), name), [online]);

  const create = useCallback(async (name: string, playerClass: string, costume: string) => {
    setView(await createCharacter(online(), name, playerClass, costume));
  }, [online]);

  const select = useCallback(async (id: string) => {
    setView(await selectCharacter(online(), id));
  }, [online]);

  // Reads the account again (after a purchase the server unlocks it a moment later).
  const refresh = useCallback(async () => {
    if (!transport) return null;
    const next = await loadAccount(transport);
    setView(next);
    return next;
  }, [transport]);

  return { view, failed, pickWorld, checkName, create, select, refresh };
}
