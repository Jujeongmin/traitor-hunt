export type Json = Record<string, any>;

export type WorldEvent =
  | { kind: "roomState"; roomId: string; state: Json }
  | { kind: "roomUsers"; roomId: string; users: Json[] }
  | { kind: "userState"; account: string; state: Json }
  | { kind: "message"; roomId: string; to: string | null; type: string; message: unknown };

interface RoomRecord {
  state: Json;
  users: Map<string, Json>;
  members: string[];
}

type AnyFunction = (...args: unknown[]) => unknown;

interface CollectionQuery {
  filters?: { field: string; operator: string; value: unknown }[];
  limit?: number;
}

// Only equality filters so far; anything else fails loudly instead of matching everything.
function query(items: Json[], options: CollectionQuery = {}): Json[] {
  let found = items;
  for (const filter of options.filters ?? []) {
    if (filter.operator !== "==") throw new Error(`LocalWorld: unsupported filter operator ${filter.operator}`);
    found = found.filter((item) => item[filter.field] === filter.value);
  }
  return options.limit ? found.slice(0, options.limit) : found;
}

function copy<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

const GLOBAL_NAMES = ["$global", "$room", "$sender", "$lock"] as const;

// The Verse8 globals are process-wide, so every world must take turns, not just calls within one world.
let sharedQueue: Promise<unknown> = Promise.resolve();

export class LocalWorld {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly userStates = new Map<string, Json>();
  private readonly collections = new Map<string, Map<string, Json>>();
  private readonly listeners = new Set<(event: WorldEvent) => void>();
  private readonly dirtyRooms = new Set<string>();
  private readonly dirtyUsers = new Set<string>();
  private readonly dirtyAccounts = new Set<string>();
  private pendingMessages: WorldEvent[] = [];
  private seq = 0;

  constructor(private readonly server: object) {}

  subscribe(listener: (event: WorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  call(account: string, roomId: string | null, name: string, args: unknown[] = []): Promise<unknown> {
    return this.enqueue(async () => {
      const fn = (this.server as Record<string, unknown>)[name];
      if (typeof fn !== "function" || name.startsWith("$") || name === "constructor") {
        throw new Error(`unknown server function: ${name}`);
      }
      const result = await this.withContext(account, roomId, () => (fn as AnyFunction).apply(this.server, copy(args)));
      return copy(result);
    });
  }

  tick(roomId: string): Promise<void> {
    return this.enqueue(async () => {
      const hook = (this.server as Record<string, unknown>).$roomTick;
      if (typeof hook === "function") await this.withContext("", null, () => (hook as AnyFunction).call(this.server, 0, roomId));
    }) as Promise<void>;
  }

  async tickAll(): Promise<void> {
    for (const [roomId, room] of this.rooms) if (room.members.length > 0) await this.tick(roomId);
  }

  async idle(): Promise<void> {
    let seen: Promise<unknown> | null = null;
    while (seen !== sharedQueue) {
      seen = sharedQueue;
      await seen;
    }
  }

  roomState(roomId: string): Json {
    const room = this.rooms.get(roomId);
    return copy({ roomId, $users: room ? [...room.members] : [], ...(room?.state ?? {}) });
  }

  private enqueue(work: () => Promise<unknown>): Promise<unknown> {
    const result = sharedQueue.then(work, work);
    sharedQueue = result.catch(() => undefined);
    return result;
  }

  private async withContext<T>(account: string, roomId: string | null, fn: () => T | Promise<T>): Promise<T> {
    const scope = globalThis as Record<string, unknown>;
    const saved = GLOBAL_NAMES.map((name) => scope[name]);
    const sender = { account, roomId: roomId ?? undefined };
    scope.$sender = sender;
    scope.$global = this.globalApi(account);
    scope.$room = this.roomApi(() => sender.roomId);
    scope.$lock = async (_key: string, work: () => unknown) => work();
    try {
      return await fn();
    } finally {
      GLOBAL_NAMES.forEach((name, i) => {
        if (saved[i] === undefined) delete scope[name];
        else scope[name] = saved[i];
      });
      this.flush();
    }
  }

  private room(roomId: string): RoomRecord {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { state: {}, users: new Map(), members: [] };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private collection(id: string): Map<string, Json> {
    let items = this.collections.get(id);
    if (!items) {
      items = new Map();
      this.collections.set(id, items);
    }
    return items;
  }

  private leaveAll(account: string): string | null {
    let left: string | null = null;
    for (const [roomId, room] of this.rooms) {
      if (!room.members.includes(account)) continue;
      room.members = room.members.filter((m) => m !== account);
      this.dirtyRooms.add(roomId);
      left = roomId;
    }
    return left;
  }

  private globalApi(account: string) {
    const merge = (target: Json, patch: Json) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete target[key];
        else target[key] = copy(value);
      }
    };
    return {
      getRoomState: async (roomId: string) => this.roomState(roomId),
      updateRoomState: async (roomId: string, patch: Json) => {
        const room = this.room(roomId);
        merge(room.state, patch);
        this.dirtyRooms.add(roomId);
        return copy(room.state);
      },
      getAllRoomStates: async () =>
        [...this.rooms.entries()].filter(([, r]) => r.members.length > 0).map(([id]) => this.roomState(id)),
      getRoomUserState: async (roomId: string, user: string) => copy(this.rooms.get(roomId)?.users.get(user) ?? {}),
      updateRoomUserState: async (roomId: string, user: string, patch: Json) => {
        const room = this.room(roomId);
        const state = room.users.get(user) ?? {};
        merge(state, patch);
        room.users.set(user, state);
        this.dirtyUsers.add(roomId);
        return copy(state);
      },
      joinRoom: async (roomId?: string) => {
        const id = roomId ?? `room-${++this.seq}`;
        this.leaveAll(account);
        this.room(id).members.push(account);
        this.dirtyRooms.add(id);
        return id;
      },
      leaveRoom: async () => this.leaveAll(account) ?? "",
      getRoomUserAccounts: async (roomId: string) => [...(this.rooms.get(roomId)?.members ?? [])],
      countRoomUsers: async (roomId: string) => this.rooms.get(roomId)?.members.length ?? 0,
      getUserState: async (user: string) => copy(this.userStates.get(user) ?? {}),
      updateUserState: async (user: string, patch: Json) => {
        const state = this.userStates.get(user) ?? {};
        merge(state, patch);
        this.userStates.set(user, state);
        this.dirtyAccounts.add(user);
        return copy(state);
      },
      addCollectionItem: async (collectionId: string, item: Json) => {
        const stored = { ...copy(item), __id: `item-${++this.seq}` };
        this.collection(collectionId).set(stored.__id, stored);
        return copy(stored);
      },
      getCollectionItem: async (collectionId: string, itemId: string) => {
        const item = this.collections.get(collectionId)?.get(itemId);
        if (!item) throw new Error(`Item ${itemId} not found in collection ${collectionId}`);
        return copy(item);
      },
      updateCollectionItem: async (collectionId: string, item: Json) => {
        const stored = this.collections.get(collectionId)?.get(item.__id);
        if (!stored) throw new Error(`Item ${item.__id} not found in collection ${collectionId}`);
        merge(stored, item);
        return copy(stored);
      },
      getCollectionItems: async (collectionId: string, options?: CollectionQuery) =>
        query([...this.collection(collectionId).values()], options).map(copy),
      deleteCollectionItem: async (collectionId: string, itemId: string) => {
        if (!this.collections.get(collectionId)?.delete(itemId)) {
          throw new Error(`Item ${itemId} not found in collection ${collectionId}`);
        }
        return { __id: itemId };
      },
      countCollectionItems: async (collectionId: string) => this.collections.get(collectionId)?.size ?? 0,
      deleteCollection: async (collectionId: string) => {
        this.collections.delete(collectionId);
        return collectionId;
      },
    };
  }

  private roomApi(currentRoom: () => string | undefined) {
    const push = (to: string | null, type: string, message: unknown) => {
      const roomId = currentRoom();
      if (roomId) this.pendingMessages.push({ kind: "message", roomId, to, type, message: copy(message) });
    };
    return {
      broadcastToRoom: (type: string, message: unknown) => push(null, type, message),
      sendMessageToUser: (type: string, to: string, message: unknown) => push(to, type, message),
    };
  }

  private flush(): void {
    const events: WorldEvent[] = [];
    for (const roomId of this.dirtyRooms) events.push({ kind: "roomState", roomId, state: this.roomState(roomId) });
    for (const roomId of this.dirtyUsers) {
      const users = [...(this.rooms.get(roomId)?.users.entries() ?? [])].map(([account, state]) => ({ account, ...copy(state) }));
      events.push({ kind: "roomUsers", roomId, users });
    }
    for (const account of this.dirtyAccounts) {
      events.push({ kind: "userState", account, state: copy(this.userStates.get(account) ?? {}) });
    }
    events.push(...this.pendingMessages);
    this.dirtyRooms.clear();
    this.dirtyUsers.clear();
    this.dirtyAccounts.clear();
    this.pendingMessages = [];
    for (const event of events) for (const listener of this.listeners) listener(event);
  }
}
