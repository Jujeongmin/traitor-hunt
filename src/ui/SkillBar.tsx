import { useEffect, useRef, useState } from "react";
import type { PlayerClass } from "../game/combat/classes";
import { iconFor, skillIconId } from "../game/render/icons";
import type { WorldHud } from "../game/render/WorldView";
import { onSettings, settings, updateSettings } from "./settings";

// Dragging a slot this far down (or up) flips whether auto-battle may use it.
const DRAG_TOGGLE = 28;

interface SkillBarProps {
  hud: WorldHud;
  playerClass: PlayerClass;
  onSkill: (slot: number) => void;
  onPotion: () => void;
}

interface CellProps {
  keyLabel: string;
  name: string;
  icon: string | null;
  // Shown in the corner: a count, or the seconds left.
  corner: string;
  // Share of the cooldown still to run (0 when ready); null for a slot not yet open.
  cooling: number | null;
  locked: boolean;
  isAuto: boolean;
  use: () => void;
  flip: () => void;
}

// One square of the bar: the icon, its key, and the auto mark under it. A tap uses it; a drag down
// (or a tap on the mark) flips auto.
function Cell({ keyLabel, name, icon, corner, cooling, locked, isAuto, use, flip }: CellProps) {
  const drag = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  return (
    <div className="hud-slot">
      <div
        className={`hud-cell${locked ? " locked" : ""}`}
        title={name}
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
        {icon && <img src={icon} alt={name} draggable={false} />}
        <span className="hud-cell-key">{keyLabel}</span>
        {corner && <span className="hud-cell-corner">{corner}</span>}
        {cooling !== null && cooling > 0 && <i className="hud-cell-cooling" style={{ height: `${Math.round(cooling * 100)}%` }} />}
      </div>
      <span className="hud-cell-name">{name}</span>
      <button type="button" className={`hud-auto-mark${isAuto ? " on" : ""}`} onClick={flip}>
        {isAuto ? "자동 ●" : "자동 ○"}
      </button>
    </div>
  );
}

// The potion and the three skills, bottom centre, as a row of squares.
export function SkillBar({ hud, playerClass, onSkill, onPotion }: SkillBarProps) {
  const [auto, setAuto] = useState(() => ({ potion: settings().autoPotion, skills: settings().autoSkills }));
  useEffect(() => onSettings((s) => setAuto({ potion: s.autoPotion, skills: s.autoSkills })), []);
  return (
    <div className="hud-skills">
      <Cell
        keyLabel="Q" name="물약" icon={iconFor("potion_small")} corner={String(hud.potions)} cooling={null}
        locked={hud.potions === 0} isAuto={auto.potion} use={onPotion}
        flip={() => updateSettings({ autoPotion: !settings().autoPotion })}
      />
      {hud.skills.map((skill, i) => (
        <Cell
          key={i}
          keyLabel={String(i + 1)}
          name={skill.name}
          icon={iconFor(skillIconId(playerClass, i))}
          corner={!skill.open ? `Lv${skill.level}` : skill.readyInMs > 0 ? `${Math.ceil(skill.readyInMs / 1000)}` : ""}
          cooling={skill.open ? skill.readyInMs / skill.cooldownMs : null}
          locked={!skill.open}
          isAuto={auto.skills[i] === true}
          use={() => onSkill(i)}
          flip={() => {
            const next = [...settings().autoSkills];
            next[i] = !next[i];
            updateSettings({ autoSkills: next });
          }}
        />
      ))}
    </div>
  );
}
