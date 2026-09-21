import type { GuideHud, HudState, ObjectiveHud, VoteHud } from "../game/render/MatchView";
import { useEffect, useState } from "react";
import { ICONS } from "./theme";


const ERROR_LABEL: Record<string, string> = {
  not_ready: "아직 빙의할 수 없어요",
  out_of_range: "너무 멀어요",
  no_monster: "가까이에 빙의할 몬스터가 없어요",
  not_at_exit: "다리 위에 서야 해요",
  too_fast: "조금 천천히",
  not_authority: "조종할 수 없는 몬스터예요",
  stunned: "몬스터가 기절했어요",
  monster_dead: "이미 쓰러진 몬스터예요",
  no_target: "대상이 없어요",
  unavailable: "지금은 할 수 없어요",
  not_playing: "경기 중이 아니에요",
  already_possessing: "이미 빙의 중이에요",
  not_possessing: "빙의 중이 아니에요",
  not_traitor: "배신자만 할 수 있어요",
  match_full: "방이 가득 찼어요",
  nothing_here: "여기엔 쓸 수 있는 게 없어요",
  need_shards: "광석 2개가 모두 있어야 해요",
  exit_locked: "아직 다리가 봉인돼 있어요",
  sealed: "정체가 드러나 빙의가 봉인됐어요",
  bound: "묶여 있어서 할 수 없어요",
  blocking: "방패를 내려야 공격할 수 있어요",
};

const PAIN_SHOW_MS = 1500;
const ERROR_SHOW_MS = 2000;
const VOTE_BANNER_MS = 6000;
const ROLE_NOTICE_MS = 4000;

// Shows the traitor, once, that they are the traitor.
function useTraitorNotice(role: HudState["role"]): boolean {
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (role === "traitor" && shownAt === null) setShownAt(performance.now());
  }, [role, shownAt]);
  useEffect(() => {
    if (shownAt === null) return;
    const timer = setTimeout(() => redraw((n) => n + 1), ROLE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shownAt]);
  return shownAt !== null && performance.now() - shownAt < ROLE_NOTICE_MS;
}

function clock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function seconds(ms: number): number {
  return Math.ceil(ms / 1000);
}

function objectiveText(o: ObjectiveHud): string {
  switch (o.stage) {
    case "shards":
      return o.shards < o.shardTotal ? `광석 찾기 ${o.shards}/${o.shardTotal}` : "나무 문으로 가서 광석으로 열기";
    case "devices":
      return `룬 선돌 ${o.devicesOn}/${o.deviceTotal} 깨어남 — 둘을 동시에 깨워야 문이 열린다`;
    case "seal":
      if (!o.sealStarted) return "돌 제단에서 봉인 해제 시작";
      return `봉인 해제 ${seconds(o.sealMs)}/${seconds(o.sealTotalMs)}초${o.guarded ? "" : " — 돌 제단 곁을 지키세요!"}`;
    case "boss":
      return o.bossHp === null ? "보스 처치" : `보스 처치 — 체력 ${o.bossHp}/${o.bossMaxHp}`;
    case "exit":
      return "다리로 탈출 (F)";
  }
}

// Practice only: what to do now, with an arrow that turns toward it.
function GuidePanel({ guide }: { guide: GuideHud }) {
  return (
    <div className="hud-guide band">
      {guide.bearing !== null && (
        <span className="guide-arrow" style={{ transform: `rotate(${guide.bearing}rad)` }} aria-hidden="true">➤</span>
      )}
      <span className="guide-text">{guide.text}</span>
      {guide.distance !== null && <span className="guide-distance">{Math.round(guide.distance)} m</span>}
    </div>
  );
}

function VotePanel({ vote }: { vote: VoteHud }) {
  const deciding = vote.leading !== null && vote.decideInMs !== null;
  return (
    <div className="hud-vote">
      <div className="hud-vote-title band">
        투표 {seconds(vote.remainingMs)}초 — 발판에 서서 지목 · {vote.needed}명이면 바로 결정
      </div>
      <div className="hud-vote-plates">
        {vote.plates.map((p, i) => (
          <span key={i} className={`plate${p.skip ? " skip" : ""}${vote.mine === i ? " mine" : ""}${vote.leading === i ? " leading" : ""}`}>
            {p.name}
            <b>{p.votes}</b>
          </span>
        ))}
      </div>
      {deciding && <div className="hud-vote-deciding band">{vote.plates[vote.leading!].name} 결정까지 {seconds(vote.decideInMs!)}초</div>}
    </div>
  );
}

function voteResultText(name: string | null, guilty: boolean): string {
  if (name === null) return "투표 결과: 아무도 지목되지 않았다";
  return guilty ? `${name}은(는) 배신자였다! 빙의가 봉인됐다` : `${name}은(는) 무고했다 — 20초 동안 묶인다`;
}

function possessionText(hud: HudState): string {
  if (hud.sealed) return "정체가 드러나 빙의가 봉인됐다";
  if (hud.possession) return `빙의 중 ${clock(hud.possession.remainingMs)} · 클릭 공격 · R 해제`;
  if (hud.possessReadyInMs !== null && hud.possessReadyInMs > 0) return `빙의 준비 중 ${clock(hud.possessReadyInMs)}`;
  if (hud.canPossess) return "Q: 가까운 몬스터에 빙의";
  return "빙의 가능 — 몬스터 12m 안으로 가세요";
}

export function Hud({ hud, now }: { hud: HudState; now: number }) {
  const pain = hud.painAt !== null && now - hud.painAt < PAIN_SHOW_MS;
  const error = hud.error && now - hud.error.at < ERROR_SHOW_MS ? (ERROR_LABEL[hud.error.code] ?? null) : null;
  const inside = hud.alive && !hud.escaped;
  const vote = hud.lastVote && hud.lastVote.ageMs < VOTE_BANNER_MS ? hud.lastVote : null;
  const traitorNotice = useTraitorNotice(hud.role);
  return (
    <>
      <div className="hud-top band">
        {hud.role && (
          <span className={`stat role-${hud.role}`}>
            <img className="icon" src={hud.role === "traitor" ? ICONS.traitor : ICONS.adventurer} alt="" />
            {hud.name}
          </span>
        )}
        {hud.hp !== null && (
          <span className="stat">
            <img className="icon small" src={ICONS.heart} alt="" />
            {hud.hp}
          </span>
        )}
        {hud.elapsedMs !== null && <span className="stat timer">{clock(hud.elapsedMs)}</span>}
      </div>
      {hud.objective && <div className="hud-objective band">{objectiveText(hud.objective)}</div>}
      {hud.revealed && (
        <div className="hud-revealed band">
          <img className="icon small" src={ICONS.skull} alt="" />
          배신자: {hud.revealed}
        </div>
      )}
      {hud.role === "traitor" && inside && (
        <div className="hud-possess band">
          <img className="icon small" src={ICONS.traitor} alt="" />
          {possessionText(hud)}
        </div>
      )}
      {inside && hud.interactHint && (
        <div className="hud-prompt band">
          <img className="icon small" src={ICONS.hand} alt="" />
          {hud.interactHint}
        </div>
      )}
      {hud.nearExit && <div className="hud-prompt low band">F: 탈출</div>}
      {hud.vote && <VotePanel vote={hud.vote} />}
      {vote && (
        <div className={`hud-banner band ${vote.name === null ? "passed" : vote.guilty ? "guilty" : "innocent"}`}>
          {voteResultText(vote.name, vote.guilty)}
        </div>
      )}
      {hud.boundMs !== null && (
        <div className="hud-bound band">
          <img className="icon small" src={ICONS.bound} alt="" />
          묶여 있음 {seconds(hud.boundMs)}초
        </div>
      )}
      {!hud.alive && (
        <div className="hud-prompt band">
          <img className="icon small" src={ICONS.skull} alt="" />
          쓰러졌습니다 — 결과를 기다리는 중
        </div>
      )}
      {hud.escaped && <div className="hud-prompt band">탈출했습니다 — 결과를 기다리는 중</div>}
      {traitorNotice && (
        <div className="role-notice">
          <img className="icon big" src={ICONS.traitor} alt="" />
          <strong>당신은 배신자다</strong>
          <span className="band">몬스터에 빙의해 모험가들의 탈출을 막아라 (Q)</span>
        </div>
      )}
      {pain && <div className="pain"><span className="band">가까이서 비명이 들렸다!</span></div>}
      {error && <div className="hud-error band">{error}</div>}
      {inside && !hud.possession && <div className="crosshair" />}
      {hud.blocking && <div className="hud-shield band">방패 막는 중</div>}
      {hud.guide && <GuidePanel guide={hud.guide} />}
    </>
  );
}
