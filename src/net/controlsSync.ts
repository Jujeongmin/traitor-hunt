import type { Controls } from "../game/account/controls";
import { controlsOf, onSettings, settings, updateSettings } from "../ui/settings";
import type { MatchTransport } from "./transport";

// A change to the bar is saved this long after the last one, so dragging a few skills around is one
// save.
export const CONTROLS_SAVE_MS = 1000;

// Keeps the bar's set-up on the account: what the account has replaces this browser's copy on
// connecting (an account with none yet takes this browser's), and every later change is saved.
// Answers a function that stops it.
export function syncControls(transport: MatchTransport): () => void {
  let stopped = false;
  let saved: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = (controls: Controls) => {
    saved = JSON.stringify(controls);
    void transport.call("saveControls", [controls]).catch(() => undefined);
  };
  void transport.call<Controls | null>("getControls").then(
    (stored) => {
      if (stopped) return;
      if (stored) {
        saved = JSON.stringify(stored);
        updateSettings(stored);
      } else {
        save(controlsOf(settings()));
      }
    },
    () => undefined,
  );
  const off = onSettings((s) => {
    // Nothing is saved before the account's copy has come in, or it would be overwritten.
    if (saved === null) return;
    const controls = controlsOf(s);
    if (JSON.stringify(controls) === saved) return;
    clearTimeout(timer);
    timer = setTimeout(() => save(controls), CONTROLS_SAVE_MS);
  });
  return () => {
    stopped = true;
    off();
    clearTimeout(timer);
  };
}
