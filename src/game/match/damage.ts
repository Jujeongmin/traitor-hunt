import { WEAPONS, classFor, type Weapon } from "./classes";
import { SKILLS, skillTargets, type Skill } from "./skills";
import {
  EXIT_RADIUS, LINK_DAMAGE_RATIO,
  MONSTER_DEATH_BODY_DAMAGE, MONSTER_STATS, PAIN_RADIUS, RANGE_SLACK,
} from "./constants";
import { isActive, isBound, matchHost } from "./lifecycle";
import { endPossession, expirePossession } from "./possession";
import {
  RuleViolation, type MatchEvent, type Pose, type Poses, type PublicMatch, type SecretMatch, type Vec2,
} from "./types";
import { BLOCK_ARC, facing, inStrikeReach } from "./melee";
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

// A sword swing at a monster: it must stand close, in front of the swing.
export function strikeMonster(
  match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string,
  shooterPose: Pose | null, poses: Poses, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginStrike(match, secret, shooter, shooterPose, now);
  const monster = match.monsters[monsterId];
  if (!monster) throw new RuleViolation("no_monster");
  if (!monster.alive) throw new RuleViolation("monster_dead");
  const weapon = weaponOf(match, shooter);
  if (!inStrikeReach(from, monster, weapon, true)) throw new RuleViolation("out_of_range");

  secret.lastShotAt[shooter] = now;
  events.push(...hitMonster(match, secret, shooter, monsterId, weapon.damage, poses, now));
  return events;
}

// Your class's skill (see skills.ts). It fires whether or not anything is in reach, and the
// cooldown starts either way.
export function useSkill(
  match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, poses: Poses, now: number,
): MatchEvent[] {
  const events = expirePossession(match, secret, now);
  const from = beginAction(match, secret, account, pose, now);
  const skill = skillOf(match, account);
  secret.skillAt ??= {};
  const last = secret.skillAt[account];
  if (last !== undefined && now - last < skill.cooldownMs) throw new RuleViolation("too_fast");
  secret.skillAt[account] = now;
  for (const id of skillTargets(from, match.monsters, skill, true)) {
    const monster = match.monsters[id];
    if (skill.stunMs > 0) monster.stunnedUntil = Math.max(monster.stunnedUntil, now + skill.stunMs);
    events.push(...hitMonster(match, secret, account, id, skill.damage, poses, now));
  }
  return events;
}

// Takes damage off a monster, counts it for the one who dealt it, and passes the hurt on to a
// possessing traitor's body.
function hitMonster(
  match: PublicMatch, secret: SecretMatch, shooter: string, monsterId: string, damage: number, poses: Poses, now: number,
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const monster = match.monsters[monsterId];
  const dealt = Math.min(damage, monster.hp);
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

// The skill a player's class gives them.
export function skillOf(match: PublicMatch, account: string): Skill {
  return SKILLS[classFor(match.classes, account, match.players.indexOf(account))];
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
  // A raised shield, facing the monster, stops part of the blow.
  const shielded = !!targetPose.block && facing(targetPose, monster, BLOCK_ARC);
  const dealt = shielded ? Math.round(stats.damage * (1 - weaponOf(match, target).block)) : stats.damage;
  if (monster.possessed) {
    secret.stats[secret.traitor].possessedDamage += Math.min(dealt, secret.hp[target] ?? 0);
  }
  events.push(...damageBody(match, secret, target, dealt, now));
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

function beginStrike(match: PublicMatch, secret: SecretMatch, shooter: string, shooterPose: Pose | null, now: number): Pose {
  const last = secret.lastShotAt[shooter];
  if (last !== undefined && now - last < weaponOf(match, shooter).intervalMs) throw new RuleViolation("too_fast");
  return beginAction(match, secret, shooter, shooterPose, now);
}

// What any swing or skill needs: a free, living player with a known pose and the shield down.
function beginAction(match: PublicMatch, secret: SecretMatch, account: string, pose: Pose | null, now: number): Pose {
  if (match.phase !== "playing") throw new RuleViolation("not_playing");
  if (!isActive(match, account)) throw new RuleViolation("unavailable");
  if (isBound(match, account, now)) throw new RuleViolation("bound");
  // A possessing traitor's body stands frozen; it cannot swing.
  if (secret.possession && secret.traitor === account) throw new RuleViolation("unavailable");
  if (!pose) throw new RuleViolation("out_of_range");
  // The shield arm is up; lower it to swing.
  if (pose.block) throw new RuleViolation("blocking");
  return pose;
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
