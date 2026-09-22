import { CLASSES, CLASS_BLURB, CLASS_LABEL, WEAPONS, isFreeClass, type PlayerClass } from "../game/combat/classes";
import { SKILLS } from "../game/combat/skills";

interface ClassPanelProps {
  picked: PlayerClass | null;
  onPick: (c: PlayerClass) => void;
  onConfirm: (c: PlayerClass) => void;
  onBack: () => void;
  // Whether the full game is bought: without it only the free classes can be made.
  owned: boolean;
  // Opens the purchase, when it can be made from here.
  onBuy: (() => void) | null;
}

// Picking a class for a new character: the six heroes stand in a row behind this panel; clicking
// one (or its name here) shows what it does.
export function ClassPanel({ picked, onPick, onConfirm, onBack, owned, onBuy }: ClassPanelProps) {
  const info = picked ? { weapon: WEAPONS[picked], skills: SKILLS[picked] } : null;
  const locked = (c: PlayerClass) => !owned && !isFreeClass(c);
  return (
    <div className="class-screen">
      <div className="class-tabs">
        {CLASSES.map((c) => (
          <button
            key={c} type="button"
            className={`class-tab${c === picked ? " picked" : ""}${locked(c) ? " locked" : ""}`}
            onClick={() => onPick(c)}
          >
            {locked(c) && <span className="class-lock" aria-label="정식판">🔒</span>}
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
            {info.skills.map((skill, i) => (
              <p key={skill.name} className="class-skill">
                <b>스킬 {i + 1} · {skill.name}</b> ({skill.level > 1 ? `Lv${skill.level}부터, ` : ""}재사용 {skill.cooldownMs / 1000}초)
                <br />
                {skill.blurb}
              </p>
            ))}
            {locked(picked) ? (
              <>
                <p className="class-locked-note">정식판을 구매하면 이 직업으로 캐릭터를 만들 수 있어요. 무료로는 전사와 궁수를 고를 수 있어요.</p>
                {onBuy && <button type="button" className="brush-button wardrobe-start" onClick={onBuy}>정식판 구매</button>}
              </>
            ) : (
              <button type="button" className="brush-button wardrobe-start" onClick={() => onConfirm(picked)}>이 직업으로 정하기</button>
            )}
            <p className="note">직업은 캐릭터를 만들 때 한 번 정해요.</p>
          </>
        ) : (
          <p className="note">캐릭터를 눌러 직업을 살펴보세요.</p>
        )}
      </aside>
    </div>
  );
}
