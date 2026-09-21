import { Server } from "../../server/src/server";
import { LocalWorld } from "./local/localWorld";
import { LocalTransport } from "./localTransport";
import type { MatchTransport } from "./transport";

// Development only: open the game with ?local and it runs the real server code in the page, so the
// whole flow (server pick, character, world, portals) can be tried without Verse8.
export function devLocalTransport(): MatchTransport | null {
  if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has("local")) return null;
  return new LocalTransport(new LocalWorld(new Server()), "test-local");
}
