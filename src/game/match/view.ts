import { MONSTER_STATS } from "./constants";
import type { MonsterKind, Poses, Possession, PublicMatch, SecretMatch, Vec2 } from "./types";

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Whether a monster's attack lands on feet at height y: monsters stay on the floor, so a zombie only
// reaches players on the low crates, not on the high blocks. The boss reaches any of them.
export function reaches(kind: MonsterKind, y: number | undefined): boolean {
  return (y ?? 0) <= MONSTER_STATS[kind].reachY;
}

export function nearbyAccounts(poses: Poses, point: Vec2, radius: number, exclude: string): string[] {
  return Object.keys(poses)
    .filter((account) => {
      const pose = poses[account];
      return account !== exclude && pose !== null && pose !== undefined && distance(pose, point) <= radius;
    })
    .sort();
}

export interface PrivateView {
  role: "adventurer" | "traitor" | null;
  hp: number | null;
  possession: Possession | null;
  possessReadyAt: number | null;
}

export function privateView(match: PublicMatch, secret: SecretMatch | null, account: string): PrivateView {
  if (!secret || !match.players.includes(account)) return { role: null, hp: null, possession: null, possessReadyAt: null };
  const traitor = secret.traitor === account;
  return {
    role: traitor ? "traitor" : "adventurer",
    hp: secret.hp[account] ?? null,
    possession: traitor ? secret.possession : null,
    possessReadyAt: traitor ? secret.readyAt : null,
  };
}
