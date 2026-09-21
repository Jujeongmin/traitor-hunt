import { useCallback, useEffect, useState } from "react";
import type { AccountView } from "../game/account/nickname";
import { buyFullGame, fullGamePrice, onShopClosed, startShop } from "../net/shop";
import type { MatchTransport } from "../net/transport";

const VERSE = import.meta.env.VITE_AGENT8_VERSE as string | undefined;
// After the dialog closes the server hears of the purchase on its own; ask it this often, this long.
const CONFIRM_EVERY_MS = 1500;
const CONFIRM_FOR_MS = 30_000;

// The purchase button's side: open Verse8's dialog, then wait for the server to unlock the game.
export function usePurchase(transport: MatchTransport | null, refresh: () => Promise<AccountView | null>) {
  const [state, setState] = useState<"idle" | "confirming" | "late">("idle");
  const [price, setPrice] = useState(fullGamePrice());

  useEffect(() => {
    if (!transport || !VERSE) return;
    startShop(VERSE, transport.account);
    const timer = setInterval(() => setPrice(fullGamePrice()), 3000);
    return () => clearInterval(timer);
  }, [transport]);

  useEffect(() => onShopClosed((purchased) => {
    if (!purchased) return;
    setState("confirming");
    const started = Date.now();
    const poll = async () => {
      const view = await refresh().catch(() => null);
      if (view?.owned) {
        setState("idle");
        return;
      }
      if (Date.now() - started >= CONFIRM_FOR_MS) {
        setState("late");
        return;
      }
      setTimeout(() => void poll(), CONFIRM_EVERY_MS);
    };
    void poll();
  }), [refresh]);

  const buy = useCallback(() => {
    if (VERSE) buyFullGame(VERSE);
  }, []);

  return { state, price, buy: transport && VERSE ? buy : null };
}
