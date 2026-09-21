import { Server } from "../../server/src/server";
import { BotBrain } from "../game/bots/botBrain";
import type { PlayerClass } from "../game/match/classes";
import type { Pose } from "../game/match/types";
import type { LevelLayout } from "../game/rules/levelLayout";
import { HostDirector } from "./hostDirector";
import { LocalWorld } from "./local/localWorld";
import { LocalTransport } from "./localTransport";
import { MatchClient } from "./matchClient";

export const PRACTICE_BOTS = 3;
export const PRACTICE_ACCOUNT = "test-you";
const ROOM_TICK_MS = 1000;

export interface PracticeOptions {
  bots?: number;
  autopilot?: boolean;
  // The class you picked in the menu; the practice room seats you with it.
  playerClass?: PlayerClass;
}

interface Seat {
  client: MatchClient;
  brain: BotBrain;
  director: HostDirector;
}

export class PracticeSession {
  readonly world = new LocalWorld(new Server());
  readonly human: MatchClient;
  private readonly humanDirector: HostDirector;
  private readonly autopilot: BotBrain | null;
  private readonly bots: Seat[] = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  // StrictMode disposes the first session while its start() is still running.
  private disposed = false;

  constructor(
    private readonly layout: LevelLayout,
    private readonly options: PracticeOptions = {},
  ) {
    this.human = new MatchClient(new LocalTransport(this.world, PRACTICE_ACCOUNT));
    this.humanDirector = new HostDirector(this.human, layout);
    this.autopilot = options.autopilot ? new BotBrain(this.human, layout) : null;
  }

  async start(): Promise<void> {
    if (this.options.playerClass) {
      await new LocalTransport(this.world, PRACTICE_ACCOUNT).call("setClass", [this.options.playerClass]);
    }
    await this.human.join();
    const count = this.options.bots ?? PRACTICE_BOTS;
    for (let i = 1; i <= count; i++) {
      const client = new MatchClient(new LocalTransport(this.world, `test-bot-${i}`));
      await client.join();
      const brain = new BotBrain(client, this.layout, Math.random, { assist: PRACTICE_ACCOUNT });
      this.bots.push({ client, brain, director: new HostDirector(client, this.layout) });
    }
    await this.world.idle();
    await this.human.refresh();
    if (this.disposed) return;
    this.tickTimer = setInterval(() => void this.world.tickAll(), ROOM_TICK_MS);
  }

  update(dt: number, humanPose: Pose | null): void {
    if (this.autopilot) this.autopilot.update(dt);
    this.humanDirector.update(dt, this.autopilot ? this.autopilot.pose : humanPose);
    this.human.tick();
    for (const seat of this.bots) {
      seat.brain.update(dt);
      seat.director.update(dt, seat.brain.pose);
      seat.client.tick();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.human.dispose();
    for (const seat of this.bots) seat.client.dispose();
  }
}
