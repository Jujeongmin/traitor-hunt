import { WEAPONS, classFor, type Weapon } from "./classes";
import {
  EXIT_RADIUS, LINK_DAMAGE_RATIO,
  MONSTER_DEATH_BODY_DAMAGE, MONSTER_STATS, PAIN_RADIUS, RANGE_SLACK,
} from "./constants";
import { isActive, isBound, matchHost } from "./lifecycle";
import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type MatchEvent, type Pose, type Poses, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";
import { distance, nearbyAccounts, reaches } from "./view";

export interface MonsterPoseUpdate { id: string; x: number; z: number; yaw: number }

export function monsterAuthority(match: PublicMatch, secret: SecretMatch, monsterId: string): string | null {
  if (secret.possession?.monsterId === monsterId) return secret.traitor;
  return matchHost(match);
}

export function applyMonsterPoses(
  match: PublicMatch, secret: SecretMatch, caller: string, updates: MonsterPoseUpdate[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") return events;
  for (const u of updates) {
    const monster = match.monsters[u.id];
    if (!monster || !monster.alive) continue;
    if (![u.x, u.z, u.yaw].every(Number.isFinite)) continue;
    if (monsterAuthority(match, secret, u.id) !== caller) continue;
    monster.x = u.x;
    monster.z = u.z;
    monster.yaw = u.yaw;
  }
  return events;
}

export function shootMonster(
  match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string,
  shooterPose: Pose | null, poses: Poses, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginShot(match, secret, shooter, shooterPose, now);
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  const weapon = weaponOf(match, shooter);
  if (distance(from, monster) > weapon.range + RANGE_SLACK) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  const dealt = Math.min(weapon.damage, monster.hp);
  monster.hp -= dealt;
  const stats = secret.stats[shooter];
  stats.monsterDamage += dealt;
  const killed = monster.hp === 0;
  if (killed) {
    monster.alive = false;
    stats.monsterKills += 1;
  }

  if (monster.possessed) {
    const traitor = secret.traitor;
    const body = Math.round(dealt * LINK_DAMAGE_RATIO) + (killed ? MONSTER_DEATH_BODY_DAMAGE : 0);
    const applied = Math.min(body, secret.hp[traitor] ?? 0);
    if (shooter !== traitor) stats.traitorDamage += applied;
    const bodyPose = poses[traitor];
    if (bodyPose) {
      events.push({ type: "pain", x: bodyPose.x, z: bodyPose.z, to: nearbyAccounts(poses, bodyPose, PAIN_RADIUS, traitor) });
    }
    events.push(...damageBody(match, secret, traitor, body, now));
    if (killed) events.push(...endPossession(match, secret, now));
  }
  return events;
}

export function monsterAttack(
  match: PublicMatch, secret: SecretMatch, caller: string, monsterId: string,
  target: string, targetPose: Pose | null, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  if (monsterAuthority(match, secret, monsterId) !== caller) throw new RuleViolation("not_authority");
  if (now < monster.stunnedUntil) throw new RuleViolation("stunned");
  if (now < monster.attackReadyAt) throw new RuleViolation("too_fast");
  if (!isActive(match, target)) throw new RuleViolation("no_target");
  const stats = MONSTER_STATS[monster.kind];
  if (!targetPose || distance(monster, targetPose) > stats.range + RANGE_SLACK) {
    throw new RuleViolation("out_of_range");
  }
  if (!reaches(monster.kind, targetPose.y)) throw new RuleViolation("out_of_reach");

  monster.attackReadyAt = now + stats.intervalMs;
  if (monster.possessed) {
    secret.stats[secret.traitor].possessedDamage += Math.min(stats.damage, secret.hp[target] ?? 0);
  }
  events.push(...damageBody(match, secret, target, stats.damage, now));
  return events;
}

export function reachExit(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, exits: Vec2[], now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (!pose || !exits.some((e) => distance(pose, e) <= EXIT_RADIUS)) throw new RuleViolation("not_at_exit");
  if (match.objectives.stage !== "exit") throw new RuleViolation("exit_locked");
  if (isBound(match, account, now)) throw new RuleViolation("bound");
  match.escaped.push(account);
  if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  return events;
}

// The weapon a player carries, by the class the match recorded for their seat.
export function weaponOf(match: PublicMatch, account: string): Weapon {
  return WEAPONS[classFor(match.classes, account, match.players.indexOf(account))];
}

function beginShot(match: PublicMatch, secret: SecretMatch, shooter: string, shooterPose: Pose | null, now: number): Pose {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, shooter)) throw new RuleViolation("unavailable");
  if (isBound(match, shooter, now)) throw new RuleViolation("bound");
  // A possessing traitor's body stands frozen; it cannot shoot.
  if (secret.possession && secret.traitor === shooter) throw new RuleViolation("unavailable");
  const last = secret.lastShotAt[shooter];
  if (last !== undefined && now - last < weaponOf(match, shooter).intervalMs) throw new RuleViolation("too_fast");
  if (!shooterPose) throw new RuleViolation("out_of_range");
  return shooterPose;
}

function damageBody(match: PublicMatch, secret: SecretMatch, account: string, amount: number, now: number): MatchEvent[] {
  const hp = Math.max(0, (secret.hp[account] ?? 0) - amount);
  secret.hp[account] = hp;
  const events: MatchEvent[] = [{ type: "private", account }];
  if (hp === 0 && !match.dead.includes(account)) {
    match.dead.push(account);
    if (account === secret.traitor) events.push(...endPossession(match, secret, now));
  }
  return events;
}
