import { crowdBlocks, PLAYER_BODY, type Body } from "../rules/crowd";
import { solidWith, type LevelLayout } from "../rules/levelLayout";
import { MAX_STEP_SECONDS, stepAround, type SolidTest } from "../rules/movement";
import { BOSS_MOVES, MONSTERS, ZONE_BOSS, respawned, type MonsterState } from "./monsters";

const BOSSES = new Set(Object.values(ZONE_BOSS));

// A player as the monsters see them.
export interface Prey { account: string; x: number; z: number }

export interface MonsterHit { monsterId: string; account: string; damage: number }

// A monster this far from where it started gives up the chase, walks home and heals.
export const LEASH = 20;

// One step of every monster in a room: the fallen come back when their time is up, the rest chase
// the nearest player they can see, walk round each other, the players and the forest, and swing
// when close enough. Returns the blows landed; the caller takes them off the players.
export function stepMonsters(
  monsters: Record<string, MonsterState>, prey: readonly Prey[], layout: LevelLayout, dt: number, now: number,
): MonsterHit[] {
  const hits: MonsterHit[] = [];
  const walls: SolidTest = solidWith(layout, 0);
  for (const [id, m] of Object.entries(monsters)) {
    const spec = MONSTERS[m.type];
    if (!m.alive) {
      // The boss's brood is gone for good; everything else comes back where it started.
      if (m.summoned) delete monsters[id];
      else if (now >= m.respawnAt) monsters[id] = respawned(m);
      continue;
    }
    if (BOSSES.has(m.type) && stepBoss(id, m, monsters, prey, now, hits)) continue;
    if (now < m.stunnedUntil) continue;

    const fromHome = Math.hypot(m.x - m.homeX, m.z - m.homeZ);
    let target: { prey: Prey; d: number } | null = null;
    if (fromHome <= LEASH) {
      for (const p of prey) {
        const d = Math.hypot(p.x - m.x, p.z - m.z);
        if (d <= spec.aggro && (!target || d < target.d)) target = { prey: p, d };
      }
    }
    const goal = target ? target.prey : { x: m.homeX, z: m.homeZ };
    const d = Math.hypot(goal.x - m.x, goal.z - m.z);
    const yaw = Math.atan2(-(goal.x - m.x), -(goal.z - m.z));

    if (target && d <= spec.range) {
      m.yaw = yaw;
      if (now >= m.attackReadyAt) {
        // A raging boss swings faster and harder.
        const rage = BOSSES.has(m.type) && m.hp < spec.hp * BOSS_MOVES.rageBelow;
        m.attackReadyAt = now + spec.attackMs * (rage ? BOSS_MOVES.rageSpeed : 1);
        hits.push({ monsterId: id, account: target.prey.account, damage: Math.round(spec.damage * (rage ? BOSS_MOVES.rageDamage : 1)) });
      }
      continue;
    }
    if (!target && d < 0.5) {
      // Home: whole again after a lost chase (a boss forgets its calls and its slam).
      m.hp = spec.hp;
      if (BOSSES.has(m.type)) {
        m.calls = 0;
        m.slamAt = undefined;
        m.slamming = false;
      }
      continue;
    }

    const bodies: Body[] = [];
    for (const [otherId, other] of Object.entries(monsters)) {
      if (otherId !== id && other.alive) bodies.push({ x: other.x, z: other.z, r: spec.body + MONSTERS[other.type].body });
    }
    for (const p of prey) bodies.push({ x: p.x, z: p.z, r: spec.body + PLAYER_BODY });
    // The movement rules take at most MAX_STEP_SECONDS at a time.
    let left = dt;
    while (left > 1e-6) {
      const step = Math.min(left, MAX_STEP_SECONDS);
      left -= step;
      const blocked: SolidTest = (x, z) => walls(x, z) || crowdBlocks(bodies, m, x, z);
      const moved = stepAround({ x: m.x, z: m.z, yaw }, yaw, step, blocked, spec.speed);
      m.x = moved.x;
      m.z = moved.z;
    }
    m.yaw = yaw;
  }
  return hits;
}

// The boss's own moves, before its ordinary chase and bite. Calls its brood at set shares of its
// health; with a hunter near, slams the ground on a timer after a warning. Returns true while it is
// rearing up for a slam (it neither moves nor bites then).
function stepBoss(
  id: string, m: MonsterState, monsters: Record<string, MonsterState>, prey: readonly Prey[], now: number, hits: MonsterHit[],
): boolean {
  const spec = MONSTERS[m.type];
  const calls = m.calls ?? 0;
  const threshold = BOSS_MOVES.summonAt[calls];
  if (threshold !== undefined && m.hp <= spec.hp * threshold) {
    for (let i = 0; i < BOSS_MOVES.summonCount; i++) {
      const a = (i / BOSS_MOVES.summonCount) * Math.PI * 2;
      const x = m.x + Math.cos(a) * 3;
      const z = m.z + Math.sin(a) * 3;
      const type = BOSS_MOVES.summonType;
      monsters[`${id}-brood-${calls}-${i}`] = {
        type, x, z, yaw: 0, hp: MONSTERS[type].hp, alive: true, stunnedUntil: 0, attackReadyAt: 0, respawnAt: 0,
        homeX: x, homeZ: z, summoned: true,
      };
    }
    m.calls = calls + 1;
  }

  const near = prey.filter((p) => Math.hypot(p.x - m.x, p.z - m.z) <= spec.aggro);
  if (near.length === 0) {
    m.slamming = false;
    m.slamAt = undefined;
    return false;
  }
  if (m.slamAt === undefined) m.slamAt = now + BOSS_MOVES.slamEveryMs;
  if (!m.slamming && now >= m.slamAt - BOSS_MOVES.slamWarnMs) m.slamming = true;
  if (m.slamming && now >= m.slamAt) {
    for (const p of prey) {
      if (Math.hypot(p.x - m.x, p.z - m.z) <= BOSS_MOVES.slamRadius) {
        hits.push({ monsterId: id, account: p.account, damage: BOSS_MOVES.slamDamage });
      }
    }
    m.slamming = false;
    m.slamAt = now + BOSS_MOVES.slamEveryMs;
    // The slam is its swing: the client plays the attack and a shockwave.
    m.attackReadyAt = now + spec.attackMs;
  }
  return m.slamming === true;
}
