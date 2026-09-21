import { useState, type FormEvent } from "react";
import { NICKNAME_MAX, parseNickname } from "../game/account/nickname";
import { nicknameProblem } from "../net/account";
import { RuleViolation } from "../game/world/types";

interface NicknamePanelProps {
  current: string;
  // Asks the server whether the name is free.
  isFree: (name: string) => Promise<boolean>;
  onNext: (name: string) => void;
  onClose: () => void;
}

// Naming a new character: the name is checked against every other character before you go on.
export function NicknamePanel({ current, isFree, onNext, onClose }: NicknamePanelProps) {
  const [value, setValue] = useState(current);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (checking) return;
    setChecking(true);
    setProblem(null);
    try {
      const { name } = parseNickname(value);
      if (!(await isFree(name))) throw new RuleViolation("nickname_taken");
      onNext(name);
    } catch (error) {
      setProblem(nicknameProblem(error));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="menu-modal" onClick={onClose}>
      <div className="solid-panel nickname-panel" onClick={(e) => e.stopPropagation()}>
        <h2>캐릭터 이름</h2>
        <p className="note">다른 플레이어와 친구가 이 이름으로 당신을 봅니다. 한글·영문·숫자·_ 로 2~12자, 다른 캐릭터와 겹칠 수 없어요.</p>
        <form className="nickname-form" onSubmit={submit}>
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={NICKNAME_MAX} placeholder="이름" autoFocus />
          <button type="submit" className="text-button" disabled={checking || value.trim() === ""}>
            {checking ? "확인 중…" : "다음"}
          </button>
        </form>
        {problem && <p className="nickname-problem">{problem}</p>}
        <button type="button" className="text-button close" onClick={onClose}>뒤로</button>
      </div>
    </div>
  );
}
