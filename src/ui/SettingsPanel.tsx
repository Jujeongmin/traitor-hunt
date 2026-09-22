import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, QUALITY, onSettings, settings, updateSettings, type Quality, type Settings } from "./settings";

type NumberKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type FlagKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

interface Slider {
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const percent = (v: number) => (v === 0 ? "끔" : `${Math.round(v * 100)}%`);

const SOUND: Slider[] = [
  { key: "music", label: "배경음악", min: 0, max: 1, step: 0.05, format: percent },
  { key: "volume", label: "효과음", min: 0, max: 1, step: 0.05, format: percent },
];
const CONTROL: Slider[] = [
  { key: "sensitivity", label: "마우스 감도", min: 0.3, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}배` },
];
const SCREEN: Slider[] = [
  { key: "brightness", label: "밝기", min: 0.6, max: 1.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
];
const SHOWN: { key: FlagKey; label: string }[] = [
  { key: "showNames", label: "다른 플레이어 이름" },
  { key: "damageNumbers", label: "데미지 숫자" },
  { key: "chatBubbles", label: "채팅 말풍선" },
];
const KEYS: [string, string][] = [
  ["WASD", "이동"], ["Space", "점프"], ["좌클릭 / 우클릭", "공격 / 막기"], ["1 ~ 3", "스킬"], ["Q", "물약"],
  ["E", "대화"], ["R", "자동 전투"], ["J", "퀘스트 찾아가기·보고"], ["Enter", "채팅"], ["M", "메뉴 펼치기"],
  ["Esc", "창 닫기"], ["O / L / K / U / I", "랭킹 / 퀘스트 / 스킬 / 대장간 / 가방"], ["B", "절전 모드"], ["P", "설정"],
];

// The settings, in sections: sound (music and effects apart), controls, screen and what is shown over
// the world, with the keys to look up. Everything applies at once and is kept in this browser.
// `onExit`, in the world: back out to the menus.
export function SettingsPanel({ onClose, onExit }: { onClose: () => void; onExit?: () => void }) {
  const [values, setValues] = useState(settings());
  const [keys, setKeys] = useState(false);
  useEffect(() => onSettings(setValues), []);
  const slider = (s: Slider) => (
    <label key={s.key} className="setting-row">
      <span>{s.label}</span>
      <input
        type="range" min={s.min} max={s.max} step={s.step} value={values[s.key]}
        onChange={(e) => updateSettings({ [s.key]: Number(e.target.value) })}
      />
      <span className="setting-value">{s.format(values[s.key])}</span>
    </label>
  );
  const flag = (key: FlagKey, label: string) => (
    <label key={key} className="setting-row setting-flag">
      <span>{label}</span>
      <input type="checkbox" checked={values[key]} onChange={(e) => updateSettings({ [key]: e.target.checked })} />
      <span className="setting-value">{values[key] ? "켜짐" : "꺼짐"}</span>
    </label>
  );
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="dark-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>
        <h3>소리</h3>
        {SOUND.map(slider)}
        <h3>조작</h3>
        {CONTROL.map(slider)}
        {flag("invertY", "마우스 상하 반전")}
        <h3>화면</h3>
        {SCREEN.map(slider)}
        <div className="setting-row">
          <span>그래픽 품질</span>
          <div className="setting-choice">
            {(Object.keys(QUALITY) as Quality[]).map((q) => (
              <button
                key={q} type="button" className={`text-button${values.quality === q ? " on" : ""}`}
                onClick={() => updateSettings({ quality: q })}
              >
                {QUALITY[q].label}
              </button>
            ))}
          </div>
          <span className="setting-value" />
        </div>
        <p className="setting-note">낮을수록 가볍고 배터리를 덜 써요. 가까운 나무와 풀을 그리는 거리와 화면 해상도가 바뀌어요.</p>
        <h3>표시</h3>
        {SHOWN.map((s) => flag(s.key, s.label))}
        <button type="button" className="text-button" onClick={() => setKeys((k) => !k)}>{keys ? "단축키 닫기" : "단축키 보기"}</button>
        {keys && (
          <dl className="setting-keys">
            {KEYS.map(([k, what]) => (
              <div key={k}><dt>{k}</dt><dd>{what}</dd></div>
            ))}
          </dl>
        )}
        <div className="settings-actions">
          <button type="button" className="text-button" onClick={() => updateSettings({ ...DEFAULT_SETTINGS, ...keepBar(settings()) })}>
            기본값
          </button>
          <button type="button" className="text-button" onClick={onClose}>닫기</button>
          {onExit && <button type="button" className="text-button" onClick={onExit}>메뉴로 나가기</button>}
        </div>
      </div>
    </div>
  );
}

// Going back to the defaults leaves the skill bar and the potion as they were set up.
function keepBar(s: Settings): Partial<Settings> {
  return { hotbars: s.hotbars, autoSkills: s.autoSkills, autoPotion: s.autoPotion, potionAt: s.potionAt };
}
