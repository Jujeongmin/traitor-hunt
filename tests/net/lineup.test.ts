import { describe, expect, it } from "vitest";
import type { PartyView } from "../../src/game/account/party";
import { COSTUMES } from "../../src/game/render/costumes";
import { partyLineup } from "../../src/net/party";

const me = { account: "me", name: "유적왕", costume: COSTUMES[1], playerClass: "wizard" as const };

describe("partyLineup", () => {
  it("is just you without a party", () => {
    expect(partyLineup(me, null)).toEqual([{ name: "유적왕", costume: COSTUMES[1], playerClass: "wizard", isYou: true }]);
  });

  it("puts you first, then the others in party order with their costumes", () => {
    const view: PartyView = {
      invites: [],
      party: {
        leader: "a",
        members: [
          { account: "a", nickname: "Hunter", costume: "1413", playerClass: "ranger", online: true, activity: "menu" },
          { account: "me", nickname: "유적왕", costume: "0000", playerClass: "wizard", online: true, activity: "menu" },
          { account: "b", nickname: null, costume: "pirate", playerClass: "pirate", online: true, activity: "menu" },
        ],
      },
    };
    expect(partyLineup(me, view)).toEqual([
      { name: "유적왕", costume: COSTUMES[1], playerClass: "wizard", isYou: true },
      { name: "Hunter", costume: COSTUMES[1], playerClass: "ranger", isYou: false },
      // An unknown class takes the seat class.
      { name: "b", costume: COSTUMES[0], playerClass: "wizard", isYou: false },
    ]);
  });
});
