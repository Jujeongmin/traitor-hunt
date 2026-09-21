import { CLASSES, CLASS_BLURB, CLASS_LABEL, WEAPONS, type PlayerClass } from "../game/combat/classes";
import { SKILLS } from "../game/combat/skills";

interface ClassPanelProps {
  picked: PlayerClass | null;
  onPick: (c: PlayerClass) => void;
  onConfirm: (c: PlayerClass) => void;
  onBack: () => void;
}

// Picking a class for a new character: the six heroes stand in a row behind this panel; clicking
// one (or its name here) shows what it does.
export function ClassPanel({ picked, onPick, onConfirm, onBack }: ClassPanelProps) {
  const info = picked ? { weapon: WEAPONS[picked], skill: SKILLS[picked] } : null;
  return (
    <div className="class-screen">
      <div className="class-tabs">
        {CLASSES.map((c) => (
          <button key={c} type="button" className={`class-tab${c === picked ? " picked" : ""}`} onClick={() => onPick(c)}>
            {CLASS_LABEL[c]}
          </button>
        ))}
      </div>
      <aside className="solid-panel class-info">
        <header className="wardrobe-head">
          <h2>직업 선택</h2>
          <button type="button" className="text-button" onClick={onBack}>뒤로</button>
        </header>
        {picked && info ? (
          <>
            <h3 className="class-name">{CLASS_LABEL[picked]}</h3>
            <p>{CLASS_BLURB[picked]}</p>
            <dl className="class-stats">
              <div><dt>무기</dt><dd>{info.weapon.name} ({info.weapon.ranged ? "원거리" : "근접"})</dd></div>
              <div><dt>공격력</dt><dd>{info.weapon.damage}</dd></div>
              <div><dt>공격 속도</dt><dd>{(1000 / info.weapon.intervalMs).toFixed(1)}회/초</dd></div>
              <div><dt>사거리</dt><dd>{info.weapon.reach} m</dd></div>
              <div><dt>막기</dt><dd>{Math.round(info.weapon.block * 100)}%</dd></div>
            </dl>
            <p className="class-skill">
              <b>스킬 · {info.skill.name}</b> (1번 키, 재사용 {info.skill.cooldownMs / 1000}초)
              <br />
              {info.skill.blurb}
            </p>
            <button type="button" className="brush-button wardrobe-start" onClick={() => onConfirm(picked)}>이 직업으로 정하기</button>
            <p className="note">직업은 캐릭터를 만들 때 한 번 정해요.</p>
          </>
        ) : (
          <p className="note">캐릭터를 눌러 직업을 살펴보세요.</p>
        )}
      </aside>
    </div>
  );
}
