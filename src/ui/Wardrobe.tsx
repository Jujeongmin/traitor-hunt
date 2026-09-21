import { useEffect, useRef, useState } from "react";
import { CLASSES, CLASS_LABEL, WEAPONS, type PlayerClass } from "../game/match/classes";
import {
  COSTUMES, PARTS, PART_KEYS, optionOf, randomCostume, withPart, type Costume, type PartKey,
} from "../game/render/costumes";
import { myClass, onMyClass, setMyClass } from "./profile";

interface WardrobeProps {
  costume: Costume;
  onPick: (costume: Costume) => void;
  // Turns the hero on screen as you drag across the left side.
  onSpin: (radians: number) => void;
  onClose: () => void;
  online: boolean;
  // The last step of starting a game: the button reads "게임 시작" and starts instead of closing.
  onStart?: () => void;
}

const CLASS_BLURB: Record<PlayerClass, string> = {
  striker: "장검으로 한 번에 크게 벤다",
  guardian: "큰 방패로 몬스터의 공격을 받아낸다",
};

// Radians of turn per pixel dragged.
const SPIN_PER_PIXEL = 0.012;

// The wardrobe: a screen of its own where your hero stands on the left, turning as you drag, and the
// right side picks your class and each part of your look. Every change is kept at once.
export function Wardrobe({ costume, onPick, onSpin, onClose, online, onStart }: WardrobeProps) {
  const [picked, setPicked] = useState(myClass());
  useEffect(() => onMyClass(setPicked), []);
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
          <h2>{onStart ? "캐릭터 외형 정하기" : "캐릭터 꾸미기"}</h2>
          <button type="button" className="text-button" onClick={onClose}>{onStart ? "취소" : "완료"}</button>
        </header>

        <section>
          <h3>직업</h3>
          <div className="wardrobe-classes">
            {CLASSES.map((c) => (
              <button
                key={c}
                type="button"
                className={`wardrobe-card${c === picked ? " picked" : ""}`}
                onClick={() => setMyClass(c)}
                aria-pressed={c === picked}
              >
                <b>{CLASS_LABEL[c]}</b>
                <span>{CLASS_BLURB[c]}</span>
                <small>공격 {WEAPONS[c].damage} · 막기 {Math.round(WEAPONS[c].block * 100)}%</small>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>모양</h3>
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
          <PartRows keys={SHAPE_KEYS} costume={costume} onPick={onPick} />
        </section>

        <section>
          <h3>색</h3>
          <PartRows keys={COLOUR_KEYS} costume={costume} onPick={onPick} />
        </section>

        {onStart && <button type="button" className="brush-button wardrobe-start" onClick={onStart}>게임 시작</button>}

        <p className="note">
          바꾸는 즉시 저장돼요. {online ? "같은 방의 다른 플레이어에게도 이 모습으로 보입니다." : "Verse8 서버에 연결되면 다른 플레이어에게도 보입니다."}
        </p>
      </aside>
    </div>
  );
}

const SHAPE_KEYS = PART_KEYS.filter((k) => PARTS[k].group === "shape");
const COLOUR_KEYS = PART_KEYS.filter((k) => PARTS[k].group === "colour");

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
