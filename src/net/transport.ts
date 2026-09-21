export interface CallOptions {
  needResponse?: boolean;
  throttle?: number;
  throttleKey?: string;
}

export interface RoomUser {
  account: string;
  pose?: { x: number; z: number; yaw: number; y?: number; at?: number };
}

export interface MatchTransport {
  readonly account: string;
  call<T = unknown>(name: string, args?: unknown[], options?: CallOptions): Promise<T>;
  subscribeRoomState(roomId: string, cb: (state: Record<string, unknown>) => void): () => void;
  subscribeRoomUsers(roomId: string, cb: (users: RoomUser[]) => void): () => void;
  onRoomMessage(roomId: string, type: string, cb: (message: unknown) => void): () => void;
  // Your own account's server state (nickname, friend lists), pushed whenever it changes.
  subscribeMyState(cb: (state: Record<string, unknown>) => void): () => void;
  // Verse8 2.0: the server picks a room and the client joins it; calls made while in a room run
  // with that room as $room. Joining another room leaves the one you were in.
  joinRoom(roomId: string): Promise<void>;
  leaveRoom(): void;
}
