import { useEffect, useRef } from "react";
import {
  COSTUMES, PARTS, PART_KEYS, optionOf, randomCostume, withPart, type Costume, type PartKey,
} from "../game/render/costumes";

interface WardrobeProps {
  costume: Costume;
  onPick: (costume: Costume) => void;
  // Turns the hero on screen as you drag across the left side.
  onSpin: (radians: number) => void;
  onClose: () => void;
  // The last step of making a character: saves it.
  onStart: () => void;
  // While the character is being saved.
  busy: boolean;
}


// Radians of turn per pixel dragged.
const SPIN_PER_PIXEL = 0.012;

// The last step of making a character: it stands on the left, turning as you drag, and the right
// side picks each part of its look, fixed once the character is made.
export function Wardrobe({ costume, onPick, onSpin, onClose, onStart, busy }: WardrobeProps) {
  const drag = useRef<number | null>(null);

  // Escape leaves, like the other screens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preset = COSTUMES.find((c) => c.id === costume.id);

  return (
    <div className="wardrobe">
      <div
        className="wardrobe-stage"
        onPointerDown={(e) => {
          drag.current = e.clientX;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          onSpin((e.clientX - drag.current) * SPIN_PER_PIXEL);
          drag.current = e.clientX;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span className="wardrobe-hint">드래그해서 돌려 보기</span>
      </div>

      <aside className="wardrobe-panel">
        <header className="wardrobe-head">
          <h2>캐릭터 외형 정하기</h2>
          <button type="button" className="text-button" onClick={onClose}>뒤로</button>
        </header>

        <section>
          <h3>모습</h3>
          <div className="wardrobe-presets">
            {COSTUMES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`wardrobe-chip${preset?.id === c.id ? " picked" : ""}`}
                onClick={() => onPick(c)}
              >
                {c.name}
              </button>
            ))}
            <button type="button" className="wardrobe-chip" onClick={() => onPick(randomCostume())}>무작위</button>
          </div>
          <PartRows keys={PART_KEYS} costume={costume} onPick={onPick} />
        </section>

        <button type="button" className="brush-button wardrobe-start" onClick={onStart} disabled={busy}>
          {busy ? "만드는 중…" : "캐릭터 만들기"}
        </button>

        <p className="note">외형은 캐릭터를 만든 뒤에는 바꿀 수 없어요.</p>
      </aside>
    </div>
  );
}


// One row per part: its name, and arrows that step through its options.
function PartRows({ keys, costume, onPick }: { keys: PartKey[]; costume: Costume; onPick: (c: Costume) => void }) {
  return (
    <ul className="wardrobe-parts">
      {keys.map((key) => {
        const part = PARTS[key];
        return (
          <li key={key}>
            <span className="wardrobe-part-label">{part.label}</span>
            <button type="button" className="wardrobe-arrow" aria-label={`${part.label} 이전`} onClick={() => onPick(withPart(costume, key, -1))}>‹</button>
            <span className="wardrobe-part-value">{optionOf(costume, key).name}</span>
            <button type="button" className="wardrobe-arrow" aria-label={`${part.label} 다음`} onClick={() => onPick(withPart(costume, key, 1))}>›</button>
          </li>
        );
      })}
    </ul>
  );
}
