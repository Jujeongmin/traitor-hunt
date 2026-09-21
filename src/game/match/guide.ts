import type { LevelLayout } from "../rules/levelLayout";
import { BOSS_ID } from "./objectives";
import type { PlayerPose } from "../rules/movement";
import type { PublicMatch, Vec2 } from "./types";

// A step told to a player who does not know the game yet: what to do now and where it is.
export interface Guide {
  text: string;
  // Null when there is nowhere to walk to (the step is already done, or it is a wait).
  at: Vec2 | null;
}

function nearest(from: Vec2, spots: readonly Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const spot of spots) {
    const d = Math.hypot(spot.x - from.x, spot.z - from.z);
    if (d < bestD) {
      best = spot;
      bestD = d;
    }
  }
  return best;
}

// The objective step for where the match stands, read from the same state the HUD shows.
export function guideFor(layout: LevelLayout, match: PublicMatch, from: Vec2): Guide | null {
  if (match.phase !== "playing") return null;
  const o = match.objectives;
  switch (o.stage) {
    case "shards": {
      const left = layout.shards.filter((_, i) => !o.shards[i]);
      if (left.length > 0) {
        return { text: `빛나는 열쇠를 찾아 E로 줍기 (${layout.shards.length - left.length}/${layout.shards.length})`, at: nearest(from, left) };
      }
      const gate = layout.gates.find((g) => g.n === 1) ?? null;
      return { text: "철문 앞에서 E로 열기", at: gate };
    }
    case "devices":
      return { text: "의식 촛대 앞에서 E — 둘을 동시에 켜야 문이 열린다", at: nearest(from, layout.devices) };
    case "seal":
      return {
        text: o.seal.lastAt === null ? "제단에서 E로 봉인 해제 시작" : "제단 곁을 지키며 몬스터 막기",
        at: layout.altar,
      };
    case "boss": {
      const boss = match.monsters[BOSS_ID];
      if (!boss?.alive) return { text: "보스를 쓰러뜨렸다 — 출구가 열린다", at: null };
      return { text: "보스를 쏴서 쓰러뜨리기", at: boss };
    }
    case "exit":
      return { text: "출구 위에 서서 F로 탈출", at: layout.exits[0] ?? null };
  }
}

// Where a point sits relative to where you look: 0 straight ahead, positive to the right, in radians.
export function bearingTo(pose: PlayerPose, at: Vec2): number {
  const dx = at.x - pose.x;
  const dz = at.z - pose.z;
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  // Camera convention: forward is (-sin yaw, -cos yaw) and right is (cos yaw, -sin yaw).
  const forward = dx * -sin + dz * -cos;
  const right = dx * cos + dz * -sin;
  return Math.atan2(right, forward);
}
