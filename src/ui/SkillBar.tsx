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

// How far a slot sits down while auto-battle may use it, and how far a finger can pull it.
const AUTO_DROP_PX = 8;
const DRAG_MAX_PX = 16;

// One square of the bar: the icon and its key. A tap uses it. Dragging it down settles it a little
// lower with a glowing band along its foot: auto-battle may use it. Dragging again lifts it back.
function Cell({ keyLabel, name, icon, corner, cooling, locked, isAuto, use, flip }: CellProps) {
  const drag = useRef<{ id: number; y: number; moved: boolean } | null>(null);
  const [pull, setPull] = useState<number | null>(null);
  const rest = isAuto ? AUTO_DROP_PX : 0;
  const offset = pull === null ? rest : Math.max(0, Math.min(DRAG_MAX_PX, rest + pull));
  return (
    <div className="hud-slot">
      <div
        className={`hud-cell${locked ? " locked" : ""}${isAuto ? " auto" : ""}${pull !== null ? " pulling" : ""}`}
        style={{ transform: `translateY(${offset}px)` }}
        title={name}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, y: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > 6) d.moved = true;
          setPull(dy);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setPull(null);
          if (!d || d.id !== e.pointerId) return;
          if (Math.abs(e.clientY - d.y) >= DRAG_TOGGLE) flip();
          else if (!d.moved) use();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setPull(null);
        }}
      >
        {icon && <img src={icon} alt={name} draggable={false} />}
        <span className="hud-cell-key">{keyLabel}</span>
        {corner && <span className="hud-cell-corner">{corner}</span>}
        {cooling !== null && cooling > 0 && <i className="hud-cell-cooling" style={{ height: `${Math.round(cooling * 100)}%` }} />}
        <i className="hud-cell-glow" />
      </div>
      <span className="hud-cell-name">{name}</span>
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
