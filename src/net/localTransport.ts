import type { LocalWorld } from "./local/localWorld";
import { CallThrottle } from "./throttle";
import type { CallOptions, MatchTransport, RoomUser } from "./transport";

export class LocalTransport implements MatchTransport {
  private roomId: string | null = null;
  private readonly throttle = new CallThrottle();

  constructor(
    private readonly world: LocalWorld,
    readonly account: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  call<T = unknown>(name: string, args: unknown[] = [], options: CallOptions = {}): Promise<T> {
    if (options.throttle && !this.throttle.allow(options.throttleKey ?? name, options.throttle, this.now())) {
      return Promise.resolve(undefined as T);
    }
    const pending = this.world.call(this.account, this.roomId, name, args).then((result) => {
      // The calls that move you between rooms, as the real platform tracks it for you.
      if (name === "enterWorld" || name === "travel") this.roomId = (result as { roomId: string }).roomId;
      if (name === "leaveWorld") this.roomId = null;
      return result as T;
    });
    if (options.needResponse === false) {
      pending.catch(() => undefined);
      return Promise.resolve(undefined as T);
    }
    return pending;
  }

  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "roomState" && e.roomId === roomId) cb(e.state);
    });
  }

  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "roomUsers" && e.roomId === roomId) cb(e.users as RoomUser[]);
    });
  }

  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "message" && e.roomId === roomId && e.type === type && (e.to === null || e.to === this.account)) {
        cb(e.message);
      }
    });
  }

  subscribeMyState(cb: (state: Record<string, unknown>) => void): () => void {
    return this.world.subscribe((e) => {
      if (e.kind === "userState" && e.account === this.account) cb(e.state);
    });
  }
}
