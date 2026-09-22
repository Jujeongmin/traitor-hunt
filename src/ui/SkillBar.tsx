import { useEffect, useRef, useState } from "react";
import type { WorldHud } from "../game/render/WorldView";
import { onSettings, settings, updateSettings } from "./settings";

// Dragging a slot this far down (or up) flips whether auto-battle may use it.
const DRAG_TOGGLE = 28;

interface SkillBarProps {
  hud: WorldHud;
  onSkill: (slot: number) => void;
  onPotion: () => void;
}

// The potion and the three skills, bottom centre. A tap uses one; dragging one down onto the
// "자동" mark under it lets auto-battle use it on its own (dragging again turns that off).
export function SkillBar({ hud, onSkill, onPotion }: SkillBarProps) {
  const [auto, setAuto] = useState(() => ({ potion: settings().autoPotion, skills: settings().autoSkills }));
  useEffect(() => onSettings((s) => setAuto({ potion: s.autoPotion, skills: s.autoSkills })), []);
  const drag = useRef<{ id: number; y: number; moved: boolean } | null>(null);

  const slot = (
    key: string, name: string, note: string, cooling: boolean, fill: number | null, isAuto: boolean,
    use: () => void, flip: () => void,
  ) => (
    <div className="hud-slot" key={key}>
      <div
        className={`hud-skill${cooling ? " cooling" : ""}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && d.id === e.pointerId && Math.abs(e.clientY - d.y) > 6) d.moved = true;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.id !== e.pointerId) return;
          if (Math.abs(e.clientY - d.y) >= DRAG_TOGGLE) flip();
          else if (!d.moved) use();
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span className="hud-skill-key">{key}</span>
        <b>{name}</b>
        <span>{note}</span>
        {fill !== null && <i style={{ width: `${Math.round(fill * 100)}%` }} />}
      </div>
      <button type="button" className={`hud-auto-mark${isAuto ? " on" : ""}`} onClick={flip}>
        {isAuto ? "자동 ●" : "자동 ○"}
      </button>
    </div>
  );

  return (
    <div className="hud-skills">
      {slot(
        "Q", "물약", `${hud.potions}개`, hud.potions === 0, null, auto.potion, onPotion,
        () => updateSettings({ autoPotion: !settings().autoPotion }),
      )}
      {hud.skills.map((skill, i) =>
        slot(
          String(i + 1), skill.name,
          !skill.open ? `Lv${skill.level}` : skill.readyInMs > 0 ? `${Math.ceil(skill.readyInMs / 1000)}초` : "준비됨",
          !skill.open || skill.readyInMs > 0,
          skill.open ? 1 - skill.readyInMs / skill.cooldownMs : null,
          auto.skills[i] === true,
          () => onSkill(i),
          () => {
            const next = [...settings().autoSkills];
            next[i] = !next[i];
            updateSettings({ autoSkills: next });
          },
        ))}
    </div>
  );
}
