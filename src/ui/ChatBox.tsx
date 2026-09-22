import { useEffect, useRef, useState } from "react";
import { typing } from "../game/render/FpsInput";
import { CHAT_MAX } from "../game/world/chat";
import type { ChatLine, WorldClient } from "../net/worldClient";

// Closed, the box shows the last few lines, each for a while after it came.
const QUIET_LINES = 6;
const QUIET_MS = 15_000;
// Open, it shows this many to scroll back through.
const OPEN_LINES = 30;

const PROBLEM: Record<string, string> = {
  too_fast: "조금 천천히 말해 주세요",
};

// The channel chat, at the left: the latest lines, and a box to say one. Enter opens it on a
// keyboard (and sends), the chat button on a touch screen; Escape closes it.
export function ChatBox({ client, touch }: { client: WorldClient; touch: boolean }) {
  const [lines, setLines] = useState<ChatLine[]>(client.state.chat);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => client.onChange((s) => setLines((prev) => (prev === s.chat ? prev : s.chat))), [client]);
  // Once a second, so old lines fade out of the closed box.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || typing(e)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lines, open]);

  const close = () => {
    setOpen(false);
    setProblem(null);
    input.current?.blur();
  };
  const send = async () => {
    if (!text.trim()) {
      close();
      return;
    }
    const code = await client.say(text);
    if (code) {
      setProblem(PROBLEM[code] ?? "보낼 수 없어요");
      return;
    }
    setText("");
    close();
  };

  const shown = open ? lines.slice(-OPEN_LINES) : lines.slice(-QUIET_LINES).filter((l) => now - l.heardAt < QUIET_MS);
  return (
    <div className={`chat${open ? " open" : ""}${touch ? " touch" : ""}`}>
      {shown.length > 0 && (
        <div className="chat-log" ref={log}>
          {shown.map((l) => (
            <p key={l.id} className={l.mine ? "mine" : undefined}><b>{l.name}</b> {l.text}</p>
          ))}
        </div>
      )}
      {open ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            ref={input} value={text} maxLength={CHAT_MAX} placeholder="채널에 말하기" enterKeyHint="send"
            onChange={(e) => {
              setText(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          />
          {touch && <button type="button" className="chat-close" onClick={close}>닫기</button>}
          {problem && <span className="chat-problem">{problem}</span>}
        </form>
      ) : (
        touch && <button type="button" className="chat-open band" onClick={() => setOpen(true)}>채팅</button>
      )}
    </div>
  );
}
