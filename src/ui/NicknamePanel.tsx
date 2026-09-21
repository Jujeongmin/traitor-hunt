import { useState, type FormEvent } from "react";
import { NICKNAME_MAX, parseNickname } from "../game/account/nickname";
import { nicknameProblem } from "../net/account";

interface NicknamePanelProps {
  current: string | null;
  onSave: (nickname: string) => Promise<void>;
  // "start": asked because you pressed quick start; "first": no nickname yet; "rename": changing it.
  purpose: "start" | "first" | "rename";
  // Left out on the first pick: online play needs a nickname.
  onClose?: () => void;
}

export function NicknamePanel({ current, purpose, onSave, onClose }: NicknamePanelProps) {
  const [value, setValue] = useState(current ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setProblem(null);
    try {
      parseNickname(value);
      await onSave(value);
      // While starting, saving moves on to the next step instead of closing.
      if (purpose !== "start") onClose?.();
    } catch (error) {
      setProblem(nicknameProblem(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel nickname-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{purpose === "rename" ? "닉네임 바꾸기" : "닉네임 정하기"}</h2>
        <p className="note">
          {purpose === "start" ? "게임에서 쓸 닉네임을 정해 주세요. " : ""}
          다른 플레이어와 친구가 이 이름으로 당신을 봅니다. 한글·영문·숫자·_ 로 2~12자.
        </p>
        <form className="nickname-form" onSubmit={submit}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={NICKNAME_MAX}
            placeholder="닉네임"
            autoFocus
          />
          <button type="submit" className="text-button" disabled={saving || value.trim() === ""}>
            {saving ? "저장 중…" : purpose === "start" ? "다음" : "저장"}
          </button>
        </form>
        {problem && <p className="nickname-problem">{problem}</p>}
        {onClose && <button type="button" className="text-button close" onClick={onClose}>닫기</button>}
      </div>
    </div>
  );
}
