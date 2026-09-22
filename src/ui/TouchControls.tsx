import { useEffect, useRef, useState } from "react";
import type { FpsInput } from "../game/render/FpsInput";
import { iconFor } from "../game/render/icons";

// Whether this is a touch device (a phone or tablet): then the joystick and the look area show.
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

// The joystick's ring, and how far the knob can be pushed, in CSS pixels.
const STICK_RADIUS = 56;

// The joystick on the left to walk, and a drag anywhere on the right to look round (phones only).
export function TouchStick({ controls }: { controls: FpsInput }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const stick = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);

  // Let go when the controls unmount (leaving the zone).
  useEffect(() => () => controls.setVirtualMove(0, 0), [controls]);

  const moveKnob = (e: React.PointerEvent) => {
    const el = stick.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx *= STICK_RADIUS / len;
      dy *= STICK_RADIUS / len;
    }
    setKnob({ x: dx, y: dy });
    controls.setVirtualMove(-dy / STICK_RADIUS, dx / STICK_RADIUS);
  };
  const releaseKnob = () => {
    stickPointer.current = null;
    setKnob(null);
    controls.setVirtualMove(0, 0);
  };

  return (
    <>
      <div
        className="touch-look"
        onPointerDown={(e) => {
          if (look.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const l = look.current;
          if (!l || l.id !== e.pointerId) return;
          controls.addVirtualLook((e.clientX - l.x) * 2, (e.clientY - l.y) * 2);
          l.x = e.clientX;
          l.y = e.clientY;
        }}
        onPointerUp={(e) => {
          if (look.current?.id === e.pointerId) look.current = null;
        }}
        onPointerCancel={() => {
          look.current = null;
        }}
      />
      <div
        ref={stick}
        className="touch-stick"
        onPointerDown={(e) => {
          if (stickPointer.current !== null) return;
          stickPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          moveKnob(e);
        }}
        onPointerMove={(e) => {
          if (stickPointer.current === e.pointerId) moveKnob(e);
        }}
        onPointerUp={releaseKnob}
        onPointerCancel={releaseKnob}
      >
        <div className="touch-knob" style={{ transform: `translate(${knob?.x ?? 0}px, ${knob?.y ?? 0}px)` }} />
      </div>
    </>
  );
}

interface PadButtonsProps {
  controls: FpsInput;
  auto: boolean;
  // Someone to talk to close by: then a talk button shows.
  talkTo: string | null;
  onJump: () => void;
  onAuto: () => void;
  onTalk: () => void;
  // Keyboard players see each button's key in its corner.
  keys: boolean;
}

// One round, see-through button: its picture (496 RPG icons pack), its name, and its key.
function PadButton({ id, label, keyLabel, className = "", ...rest }: {
  id: string; label: string; keyLabel: string | null; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`pad-button pad-${id} ${className}`} {...rest}>
      <img src={iconFor(`pad_${id}`) ?? undefined} alt="" draggable={false} />
      <span>{label}</span>
      {keyLabel && <kbd className="hud-key">{keyLabel}</kbd>}
    </button>
  );
}

// The round buttons at the bottom right, on every device: a big attack button (held for a flurry)
// with guard, jump, auto-battle and (by someone) talk round it.
export function PadButtons({ controls, auto, talkTo, onJump, onAuto, onTalk, keys }: PadButtonsProps) {
  useEffect(() => () => {
    controls.setVirtualFiring(false);
    controls.setVirtualBlocking(false);
  }, [controls]);

  const hold = (set: (on: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      set(true);
    },
    onPointerUp: () => set(false),
    onPointerCancel: () => set(false),
  });

  return (
    <div className="pad-buttons">
      <PadButton id="attack" label="공격" keyLabel={keys ? "좌클릭" : null} {...hold((on) => controls.setVirtualFiring(on))} />
      <PadButton id="block" label="막기" keyLabel={keys ? "우클릭" : null} {...hold((on) => controls.setVirtualBlocking(on))} />
      <PadButton id="jump" label="점프" keyLabel={keys ? "Space" : null} onPointerDown={onJump} />
      <PadButton id="auto" label={auto ? "자동 중" : "자동"} keyLabel={keys ? "R" : null} className={auto ? "on" : ""} onClick={onAuto} />
      {talkTo && <PadButton id="talk" label="대화" keyLabel={keys ? "E" : null} onClick={onTalk} />}
    </div>
  );
}
