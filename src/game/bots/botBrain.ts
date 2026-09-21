import type { MatchClient, PainEvent } from "../../net/matchClient";
import { EXIT_RADIUS, INTERACT_RANGE, MONSTER_STATS, POSSESS_RANGE, RANGE_SLACK } from "../match/constants";
import { isActive, isBound } from "../match/lifecycle";
import { BOSS_ID } from "../match/objectives";
import type { MonsterState, Pose, Poses, PublicMatch, Vec2 } from "../match/types";
import { distance } from "../match/view";
import { skipPlate, tallyPlates } from "../match/vote";
import { wallDistance } from "../rules/combat";
import { solidWith, spawnPoint, type LevelLayout } from "../rules/levelLayout";
import { EYE_HEIGHT, WALK_SPEED, stepPlayer, type SolidTest } from "../rules/movement";
import { findPath } from "../rules/pathfinding";

const SHOOT_RANGE = 14;
const REPATH_MS = 1000;
const WAYPOINT_REACHED = 0.3;
const TURN_RATE = 5;
const AIM_TOLERANCE = 0.12;
const INTERACT_EVERY_MS = 400;
const REACH = INTERACT_RANGE + RANGE_SLACK - 0.3;
const PAIN_SUSPECT_RADIUS = 3;
// Votes only open at gates, so a scream stays suspicious for a while.
const SUSPICION_MS = 180_000;
const FOLLOW_PLATE_AFTER_MS = 1_500;
const SKIP_AFTER_MS = 8_000;
const GUARD_DISTANCE = 2.5;
const PLATE_STAND = 0.5;
// How close an assisting bot walks to the player it is tagging along with.
const FOLLOW_DISTANCE = 4;

// Timings that make a bot look like a person rather than an aimbot.
const HUMAN = {
  reactMs: [300, 800],
  fireMs: [380, 650],
  pauseEveryMs: [6_000, 12_000],
  pauseMs: [600, 1_500],
  hesitateMs: [1_000, 4_000],
  pathJitter: 0.6,
  speed: [0.75, 0.95],
} as const;

interface Goal {
  at: Vec2;
  // Where to press E once close enough; null when there is nothing to use.
  useAt: Vec2 | null;
  escape: boolean;
  // Close enough to stop walking.
  near: number;
}

function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function angleBetween(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// A bot that tags along with a learner: it fights and helps where two are needed, but leaves every
// objective the player should learn (keys, gate, altar, the way out) to them.
export interface BotOptions {
  // The account this bot follows and waits for; without one the bot plays the objectives itself.
  assist?: string;
}

export class BotBrain {
  pose: Pose | null = null;
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private pathAt = Number.NEGATIVE_INFINITY;
  private busy = false;
  private solid: SolidTest;
  private gatesKey = "";
  private readonly speed: number;
  private target: { id: string; readyAt: number } | null = null;
  private nextShotAt = 0;
  private nextInteractAt = 0;
  private pauseUntil = 0;
  private nextPauseAt: number | null = null;
  private possessAt: number | null = null;
  private suspect: { account: string; until: number } | null = null;
  private readonly plateSeen = new Map<number, number>();

  constructor(
    private readonly client: MatchClient,
    private readonly layout: LevelLayout,
    private readonly rng: () => number = Math.random,
    private readonly options: BotOptions = {},
  ) {
    this.solid = solidWith(layout, []);
    this.speed = WALK_SPEED * this.between(HUMAN.speed);
    client.onPain((e) => this.hearPain(e));
  }

  update(dt: number): void {
    const { phase, match, you } = this.client.state;
    if (phase !== "playing" || !match) return;
    const me = this.client.account;
    if (!this.pose) {
      const spot = spawnPoint(this.layout, Math.max(0, match.players.indexOf(me)));
      this.pose = { x: spot.x, z: spot.z, yaw: 0 };
    }
    if (!isActive(match, me)) return;
    this.refreshSolid(match);

    const now = this.client.serverNow();
    const traitor = you.role === "traitor";
    if (traitor && you.possession) {
      this.driveMonster(match, you.possession.monsterId, dt, now);
      return;
    }
    if (!isBound(match, me, now)) {
      if (traitor) this.considerPossessing(match, now);
      this.act(match, dt, now, traitor);
    }
    if (!this.client.state.you.possession) this.client.reportPose(this.pose);
  }

  private act(match: PublicMatch, dt: number, now: number, traitor: boolean): void {
    if (this.fight(match, dt, now)) return;
    const plate = this.votePlate(match, now, traitor);
    if (plate) {
      if (distance(this.pose!, plate) > PLATE_STAND) this.walkTo(plate, dt, now);
      else this.lookAround(dt);
      return;
    }
    const goal = this.goal(match, now);
    if (!goal) return;
    const pose = this.pose!;
    if (goal.useAt && distance(pose, goal.useAt) <= REACH && now >= this.nextInteractAt) {
      this.nextInteractAt = now + INTERACT_EVERY_MS;
      this.run(() => this.client.interact());
    }
    const d = distance(pose, goal.at);
    if (goal.escape && d <= EXIT_RADIUS * 0.8) {
      this.run(() => this.client.escape());
      return;
    }
    if (d <= goal.near || this.pausing(now)) {
      this.lookAround(dt);
      return;
    }
    this.walkTo(goal.at, dt, now);
  }

  // Stops to turn toward a visible monster and shoots after a human reaction time, missing now and then.
  private fight(match: PublicMatch, dt: number, now: number): boolean {
    const pose = this.pose!;
    const seen = this.nearestMonster(match, pose, SHOOT_RANGE, true, () => true);
    if (!seen) {
      this.target = null;
      return false;
    }
    if (!this.target || this.target.id !== seen.id) {
      this.target = { id: seen.id, readyAt: now + this.between(HUMAN.reactMs) };
    }
    const aim = yawTo(pose, seen.monster);
    this.turnToward(aim, dt);
    if (now < this.target.readyAt || now < this.nextShotAt) return true;
    if (Math.abs(angleBetween(this.pose!.yaw, aim)) > AIM_TOLERANCE) return true;
    this.nextShotAt = now + this.between(HUMAN.fireMs);
    const hitChance = Math.min(0.85, Math.max(0.35, 0.9 - seen.distance * 0.04));
    if (this.rng() < hitChance) this.run(() => this.client.fireAtMonster(seen.id));
    return true;
  }

  private goal(match: PublicMatch, now: number): Goal | null {
    const o = match.objectives;
    const level = this.layout;
    const pose = this.pose!;
    const assist = this.options.assist;
    switch (o.stage) {
      case "shards": {
        // The keys and the gate are the player's to find.
        if (assist) return this.tagAlong(assist);
        let best: Vec2 | null = null;
        for (let i = 0; i < level.shards.length; i++) {
          const shard = level.shards[i];
          if (!o.shards[i] && (best === null || distance(pose, shard) < distance(pose, best))) best = shard;
        }
        if (best) return { at: best, useAt: best, escape: false, near: 0.8 };
        const gate = level.gates.find((g) => g.n === 1);
        const spot = gate ? this.approach(gate) : null;
        return gate && spot ? { at: spot, useAt: gate, escape: false, near: 0.4 } : null;
      }
      case "devices": {
        const i = this.deviceIndex(match);
        const device = level.devices[i];
        if (!device) return null;
        // Two candles must burn at once, so an assisting bot waits at the other one and lights it
        // only once the player has lit theirs.
        const helping = !assist || o.devices.some((until, n) => n !== i && until > now);
        const use = helping && o.devices[i] <= now ? device : null;
        return { at: device, useAt: use, escape: false, near: 1.2 };
      }
      case "seal": {
        const altar = level.altar;
        if (!altar) return null;
        // Guarding the altar is help; starting the seal is the player's move.
        const start = !assist && o.seal.lastAt === null;
        return { at: this.guardSpot(match, altar), useAt: start ? altar : null, escape: false, near: 0.8 };
      }
      case "boss": {
        const boss = match.monsters[BOSS_ID];
        return boss?.alive ? { at: boss, useAt: null, escape: false, near: 6 } : null;
      }
      case "exit": {
        const exit = level.exits[0];
        if (!exit) return null;
        // An assisting bot keeps the player company at the hatch and only leaves after them. Once the
        // player is out (or down for good), it takes the exit itself so the match can end.
        if (assist && isActive(match, assist)) return { at: exit, useAt: null, escape: false, near: EXIT_RADIUS + 2 };
        return { at: exit, useAt: null, escape: true, near: 0 };
      }
    }
  }

  // Walks after the player, stopping a few steps short; stands still until they show up.
  private tagAlong(account: string): Goal | null {
    const lead = this.allPoses()[account];
    return lead ? { at: { x: lead.x, z: lead.z }, useAt: null, escape: false, near: FOLLOW_DISTANCE } : null;
  }

  // A floor spot beside a closed gate, nudged toward it, that this bot can walk to.
  private approach(gate: Vec2): Vec2 | null {
    const t = this.layout.tileSize;
    const sides = [{ x: -t, z: 0 }, { x: t, z: 0 }, { x: 0, z: -t }, { x: 0, z: t }];
    for (const s of sides) {
      const side = { x: gate.x + s.x, z: gate.z + s.z };
      if (this.solid(side.x, side.z)) continue;
      const spot = { x: side.x - s.x * 0.3, z: side.z - s.z * 0.3 };
      if (findPath(this.layout, this.pose!, spot, this.solid)) return spot;
    }
    return null;
  }

  // My device is picked by seat. If a teammate with a lower seat already stands at it and the other is free, take the other.
  private deviceIndex(match: PublicMatch): number {
    const devices = this.layout.devices;
    const me = this.client.account;
    const seat = match.players.indexOf(me);
    const poses = this.allPoses();
    const standing = (i: number) => match.players.filter((p) => {
      const pose = poses[p];
      return p !== me && isActive(match, p) && !!pose && distance(pose, devices[i]) <= 4;
    });
    const mine = seat % devices.length;
    const other = (mine + 1) % devices.length;
    const takenByLower = standing(mine).some((p) => match.players.indexOf(p) < seat);
    return takenByLower && standing(other).length === 0 ? other : mine;
  }

  private guardSpot(match: PublicMatch, altar: Vec2): Vec2 {
    const seat = Math.max(0, match.players.indexOf(this.client.account));
    const angle = (seat * Math.PI) / 2;
    const spot = { x: altar.x + Math.cos(angle) * GUARD_DISTANCE, z: altar.z + Math.sin(angle) * GUARD_DISTANCE };
    return this.solid(spot.x, spot.z) ? altar : spot;
  }

  // During a vote: the suspect's plate, else a plate someone else holds, else skip after a while.
  private votePlate(match: PublicMatch, now: number, traitor: boolean): Vec2 | null {
    const me = this.client.account;
    const round = match.vote.round;
    if (this.suspect && (now > this.suspect.until || !isActive(match, this.suspect.account))) this.suspect = null;
    if (!round) {
      this.plateSeen.clear();
      return null;
    }

    let follow: number | null = null;
    for (const tally of tallyPlates(match, this.allPoses(), round.plates)) {
      if (tally.accused === null || !tally.voters.some((v) => v !== me)) {
        this.plateSeen.delete(tally.plate);
        continue;
      }
      const since = this.plateSeen.get(tally.plate) ?? now;
      this.plateSeen.set(tally.plate, since);
      if (follow === null && tally.accused !== me && now - since >= FOLLOW_PLATE_AFTER_MS) follow = tally.plate;
    }
    if (!traitor && this.suspect) {
      const plate = round.plates[match.players.indexOf(this.suspect.account)];
      if (plate) return plate;
    }
    if (follow !== null) return round.plates[follow] ?? null;
    return now - round.startedAt >= SKIP_AFTER_MS ? (round.plates[skipPlate(match)] ?? null) : null;
  }

  private hearPain(e: PainEvent): void {
    const { match, you, poses } = this.client.state;
    if (!match || you.role !== "adventurer") return;
    const me = this.client.account;
    let best: { account: string; d: number } | null = null;
    for (const account of match.players) {
      const pose = account === me ? null : poses[account];
      if (!pose || !isActive(match, account)) continue;
      const d = distance(pose, e);
      if (d <= PAIN_SUSPECT_RADIUS && (!best || d < best.d)) best = { account, d };
    }
    if (best) this.suspect = { account: best.account, until: this.client.serverNow() + SUSPICION_MS };
  }

  private considerPossessing(match: PublicMatch, now: number): void {
    const { you } = this.client.state;
    const me = this.client.account;
    if (match.revealed === me || you.possessReadyAt === null || now < you.possessReadyAt) {
      this.possessAt = null;
      return;
    }
    const pick = this.nearestMonster(match, this.pose!, POSSESS_RANGE - 1, false,
      (m) => m.kind !== "boss" && this.someoneNear(match, m, 10));
    if (!pick) return;
    if (this.possessAt === null) {
      this.possessAt = now + this.between(HUMAN.hesitateMs);
      return;
    }
    if (now < this.possessAt) return;
    this.possessAt = null;
    this.run(() => this.client.possess(pick.id));
  }

  private someoneNear(match: PublicMatch, point: Vec2, radius: number): boolean {
    const me = this.client.account;
    return match.players.some((p) => {
      const pose = this.client.state.poses[p];
      return p !== me && isActive(match, p) && !!pose && distance(pose, point) <= radius;
    });
  }

  private driveMonster(match: PublicMatch, monsterId: string, dt: number, now: number): void {
    const monster = match.monsters[monsterId];
    if (!monster || !monster.alive) return;
    const stats = MONSTER_STATS[monster.kind];
    const me = this.client.account;
    let best: { account: string; pose: Pose; d: number } | null = null;
    for (const account of match.players) {
      const pose = this.client.state.poses[account];
      if (account === me || !pose || !isActive(match, account)) continue;
      const d = distance(pose, monster);
      if (!best || d < best.d) best = { account, pose, d };
    }
    if (!best) return;
    const yaw = yawTo(monster, best.pose);
    if (best.d > stats.range * 0.8) {
      const moved = stepPlayer({ x: monster.x, z: monster.z, yaw }, { forward: 1, strafe: 0 }, dt, this.solid, stats.speed * 1.2);
      this.client.reportMonsters([{ id: monsterId, x: moved.x, z: moved.z, yaw }]);
    } else if (now >= monster.attackReadyAt) {
      const victim = best.account;
      this.run(() => this.client.attackWithMonster(monsterId, victim));
    }
  }

  private nearestMonster(
    match: PublicMatch, from: Vec2, range: number, mustSee: boolean, accept: (m: MonsterState) => boolean,
  ): { id: string; monster: MonsterState; distance: number } | null {
    let best: { id: string; monster: MonsterState; distance: number } | null = null;
    for (const [id, monster] of Object.entries(match.monsters)) {
      if (!monster.alive || monster.possessed || !accept(monster)) continue;
      const d = distance(from, monster);
      if (d > range || (best && d >= best.distance)) continue;
      if (mustSee && !this.canSee(from, monster, d)) continue;
      best = { id, monster, distance: d };
    }
    return best;
  }

  private canSee(from: Vec2, to: Vec2, d: number): boolean {
    if (d < 0.01) return true;
    const ray = { ox: from.x, oy: EYE_HEIGHT, oz: from.z, dx: (to.x - from.x) / d, dy: 0, dz: (to.z - from.z) / d };
    return wallDistance(ray, this.solid, d, this.layout.tileSize) >= d;
  }

  private walkTo(goal: Vec2, dt: number, now: number): void {
    const pose = this.pose!;
    const stale = !this.pathGoal || distance(this.pathGoal, goal) > 1 || now - this.pathAt > REPATH_MS;
    if (stale || this.path.length === 0) {
      this.path = this.wobble(findPath(this.layout, pose, goal, this.solid) ?? []);
      this.pathGoal = { x: goal.x, z: goal.z };
      this.pathAt = now;
    }
    while (this.path.length > 0 && distance(pose, this.path[0]) < WAYPOINT_REACHED) this.path.shift();
    const next = this.path[0];
    if (!next) return;
    const heading = yawTo(pose, next);
    const speed = Math.min(this.speed, distance(pose, next) / Math.max(dt, 1e-3));
    const moved = stepPlayer({ x: pose.x, z: pose.z, yaw: heading }, { forward: 1, strafe: 0 }, dt, this.solid, speed);
    this.pose = { x: moved.x, z: moved.z, yaw: pose.yaw };
    this.turnToward(heading, dt);
  }

  // Shifts the in-between waypoints a little so bots do not walk the same perfect line.
  private wobble(path: { x: number; z: number }[]): Vec2[] {
    return path.map((p, i) => {
      if (i === path.length - 1) return p;
      const moved = {
        x: p.x + (this.rng() - 0.5) * 2 * HUMAN.pathJitter,
        z: p.z + (this.rng() - 0.5) * 2 * HUMAN.pathJitter,
      };
      return this.solid(moved.x, moved.z) ? p : moved;
    });
  }

  private pausing(now: number): boolean {
    if (this.nextPauseAt === null) this.nextPauseAt = now + this.between(HUMAN.pauseEveryMs);
    if (now >= this.nextPauseAt) {
      this.pauseUntil = now + this.between(HUMAN.pauseMs);
      this.nextPauseAt = this.pauseUntil + this.between(HUMAN.pauseEveryMs);
    }
    return now < this.pauseUntil;
  }

  private lookAround(dt: number): void {
    this.pose!.yaw += (this.rng() - 0.5) * dt * 3;
  }

  private turnToward(yaw: number, dt: number): void {
    const pose = this.pose!;
    const step = TURN_RATE * dt;
    const d = angleBetween(pose.yaw, yaw);
    pose.yaw += Math.max(-step, Math.min(step, d));
  }

  private refreshSolid(match: PublicMatch): void {
    const key = match.objectives.gates.join(",");
    if (key === this.gatesKey) return;
    this.gatesKey = key;
    this.solid = solidWith(this.layout, match.objectives.gates);
    this.path = [];
  }

  private allPoses(): Poses {
    const poses: Poses = { ...this.client.state.poses };
    if (this.pose) poses[this.client.account] = this.pose;
    return poses;
  }

  private between(range: readonly [number, number]): number {
    return range[0] + this.rng() * (range[1] - range[0]);
  }

  // Sends one action at a time; skips the action while an earlier one is pending.
  private run(action: () => Promise<unknown>): boolean {
    if (this.busy) return false;
    this.busy = true;
    void action().finally(() => {
      this.busy = false;
    });
    return true;
  }
}
