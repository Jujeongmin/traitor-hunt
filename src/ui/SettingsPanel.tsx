import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, onSettings, settings, updateSettings, type Settings } from "./settings";

interface Slider {
  key: keyof Settings;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: Slider[] = [
  { key: "sensitivity", label: "마우스 감도", min: 0.3, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}배` },
  { key: "volume", label: "효과음", min: 0, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: "music", label: "배경음악", min: 0, max: 1, step: 0.05, format: (v) => (v === 0 ? "끔" : `${Math.round(v * 100)}%`) },
  { key: "brightness", label: "밝기", min: 0.6, max: 1.6, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState(settings());
  useEffect(() => onSettings(setValues), []);
  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="dark-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <h2>설정</h2>
        {SLIDERS.map((s) => (
          <label key={s.key} className="setting-row">
            <span>{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={values[s.key]}
              onChange={(e) => updateSettings({ [s.key]: Number(e.target.value) })}
            />
            <span className="setting-value">{s.format(values[s.key])}</span>
          </label>
        ))}
        <div className="settings-actions">
          <button type="button" className="text-button" onClick={() => updateSettings(DEFAULT_SETTINGS)}>기본값</button>
          <button type="button" className="text-button" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
