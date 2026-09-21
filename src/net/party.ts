import type { Activity, PartyView } from "../game/account/party";
import { COSTUMES, costumeById, type Costume } from "../game/render/costumes";
import { classForSeat, readClass, type PlayerClass } from "../game/combat/classes";
import { errorCode } from "./errors";
import type { MatchTransport } from "./transport";

const PROBLEMS: Record<string, string> = {
  not_friends: "친구만 초대할 수 있어요",
  party_full: "파티는 4명까지예요",
  already_in_party: "이미 같은 파티예요",
  no_invite: "초대가 만료되었어요",
  not_leader: "파티장만 할 수 있어요",
  party_busy: "파티원이 아직 게임 중이에요",
};

export function partyProblem(error: unknown): string {
  return PROBLEMS[errorCode(error)] ?? "지금은 할 수 없어요. 잠시 뒤 다시 시도해 주세요";
}

// Your party and invites, refreshed whenever the server changes them and on every sync().
export class PartyClient {
  view: PartyView | null = null;
  private readonly listeners = new Set<(view: PartyView) => void>();
  private unsubscribe: (() => void) | null = null;
  private seen = "";
  private disposed = false;
  private activity: Activity = "menu";

  constructor(private readonly transport: MatchTransport) {}

  async start(): Promise<void> {
    this.unsubscribe = this.transport.subscribeMyState((state) => {
      const seen = JSON.stringify([state.party ?? null, state.partyInvites ?? null]);
      if (seen === this.seen) return;
      this.seen = seen;
      void this.sync().catch(() => undefined);
    });
    await this.sync();
  }

  async sync(): Promise<void> {
    const view = await this.transport.call<PartyView>("syncParty", [this.activity]);
    if (this.disposed) return;
    this.view = view;
    for (const listener of this.listeners) listener(view);
  }

  onChange(listener: (view: PartyView) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Tells the party whether you are on the menu or out in the world.
  async setActivity(activity: Activity): Promise<void> {
    if (activity === this.activity) return;
    this.activity = activity;
    await this.sync();
  }

  async invite(account: string): Promise<void> {
    await this.transport.call("inviteToParty", [account]);
  }

  async accept(from: string): Promise<void> {
    await this.transport.call("acceptPartyInvite", [from]);
  }

  async decline(from: string): Promise<void> {
    await this.transport.call("declinePartyInvite", [from]);
  }

  async leave(): Promise<void> {
    await this.transport.call("leaveParty");
  }

  async kick(account: string): Promise<void> {
    await this.transport.call("kickFromParty", [account]);
  }

  async setClass(id: string): Promise<void> {
    await this.transport.call("setClass", [id]);
  }

  async setCostume(id: string): Promise<void> {
    await this.transport.call("setCostume", [id]);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.listeners.clear();
  }
}

// Who stands in the menu scene: you first (with your local look), then the rest of the party.
export function partyLineup(
  me: { account: string; name: string; costume: Costume; playerClass: PlayerClass },
  view: PartyView | null,
): { name: string; costume: Costume; playerClass: PlayerClass; isYou: boolean }[] {
  const others = (view?.party?.members ?? []).filter((m) => m.account !== me.account);
  return [
    { name: me.name, costume: me.costume, playerClass: me.playerClass, isYou: true },
    ...others.map((m, i) => ({
      name: m.nickname ?? m.account,
      costume: costumeById(m.costume) ?? COSTUMES[0],
      playerClass: readClass(m.playerClass) ?? classForSeat(i + 1),
      isYou: false,
    })),
  ];
}
