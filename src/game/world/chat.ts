// Channel chat: what a line may be, and how often you may say one. The server holds everyone to it;
// the client uses the same numbers to keep the box from sending what would be turned away.

// Longest line, in characters.
export const CHAT_MAX = 80;
// No two lines from one player closer than this…
export const CHAT_GAP_MS = 700;
// …and no more than CHAT_BURST of them in any CHAT_WINDOW_MS.
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

// A line as said in a channel: who said it (the name as the room shows it) and what.
export interface ChatMessage {
  account: string;
  name: string;
  text: string;
  at: number;
}

// A line fit to say: control characters out, runs of spaces made one, trimmed; null when nothing is
// left or it is too long.
export function readChat(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ").replace(/\s+/g, " ").trim();
  const length = [...text].length;
  return length === 0 || length > CHAT_MAX ? null : text;
}

// Whether a line said at `now` keeps to the pace, given the times of the ones said before.
export function chatAllowed(said: readonly number[], now: number): boolean {
  const recent = said.filter((t) => now - t < CHAT_WINDOW_MS);
  if (recent.length >= CHAT_BURST) return false;
  return recent.every((t) => now - t >= CHAT_GAP_MS);
}
