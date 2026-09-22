import { useEffect } from "react";

// Keeps the screen on while the world is open, so a phone left auto-hunting does not go dark. The
// browser drops the lock whenever the page is hidden; it is asked for again when the page comes back.
// Where it is not allowed (an old browser, or an embed that does not grant it) nothing happens.
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock;
    if (!wakeLock) return;
    let lock: { release(): Promise<void> } | null = null;
    let live = true;
    const ask = () => {
      if (document.hidden) return;
      wakeLock.request("screen").then(
        (next) => {
          if (live) lock = next;
          else void next.release().catch(() => undefined);
        },
        () => undefined,
      );
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
