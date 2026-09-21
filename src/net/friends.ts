import type { FriendEntry, FriendsView } from "../game/account/friends";
import { errorCode } from "./errors";
import type { MatchTransport } from "./transport";

const PROBLEMS: Record<string, string> = {
  friend_not_found: "그런 닉네임을 찾지 못했어요",
  friend_self: "자기 자신은 추가할 수 없어요",
  already_friends: "이미 친구예요",
  friend_limit: "친구는 100명까지 둘 수 있어요",
  request_limit: "상대가 받은 요청이 너무 많아요",
  no_request: "이미 처리된 요청이에요",
};

export function friendProblem(error: unknown): string {
  return PROBLEMS[errorCode(error)] ?? "지금은 할 수 없어요. 잠시 뒤 다시 시도해 주세요";
}

// Online first, then by name.
export function sortFriends(friends: FriendEntry[]): FriendEntry[] {
  const name = (f: FriendEntry) => f.nickname ?? f.account;
  return [...friends].sort((a, b) => Number(b.online) - Number(a.online) || name(a).localeCompare(name(b), "ko"));
}

// Your friend lists, refreshed whenever the server changes them (a request arrives, someone accepts)
// and on every sync(), which also tells the server you are online.
export class FriendsClient {
  view: FriendsView | null = null;
  private readonly listeners = new Set<(view: FriendsView) => void>();
  private unsubscribe: (() => void) | null = null;
  private lists = "";
  private disposed = false;

  constructor(private readonly transport: MatchTransport) {}

  async start(): Promise<void> {
    this.unsubscribe = this.transport.subscribeMyState((state) => {
      const lists = JSON.stringify(state.friendLists ?? null);
      if (lists === this.lists) return;
      this.lists = lists;
      void this.sync().catch(() => undefined);
    });
    await this.sync();
  }

  async sync(): Promise<void> {
    const view = await this.transport.call<FriendsView>("syncFriends");
    if (this.disposed) return;
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }

  onChange(listener: (view: FriendsView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async request(nickname: string): Promise<"requested" | "accepted"> {
    return (await this.transport.call<{ status: "requested" | "accepted" }>("requestFriend", [nickname])).status;
  }

  async accept(account: string): Promise<void> {
    await this.transport.call("acceptFriend", [account]);
  }

  // Unfriend, decline their request, or cancel yours.
  async remove(account: string): Promise<void> {
    await this.transport.call("removeFriend", [account]);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.listeners.clear();
  }
}
