import { describe, expect, it } from "vitest";
import type { PartyView } from "../../src/game/account/party";
import { COSTUMES } from "../../src/game/render/costumes";
import { partyLineup } from "../../src/net/party";

const me = { account: "me", name: "유적왕", costume: COSTUMES[1] };

describe("partyLineup", () => {
  it("is just you without a party", () => {
    expect(partyLineup(me, null)).toEqual([{ name: "유적왕", costume: COSTUMES[1], isYou: true }]);
  });

  it("puts you first, then the others in party order with their costumes", () => {
    const view: PartyView = {
      match: null,
      invites: [],
      party: {
        leader: "a",
        members: [
          { account: "a", nickname: "Hunter", costume: "111111110000", online: true, activity: "menu" },
          { account: "me", nickname: "유적왕", costume: "000000000000", online: true, activity: "menu" },
          { account: "b", nickname: null, costume: "pirate", online: true, activity: "menu" },
        ],
      },
    };
    expect(partyLineup(me, view)).toEqual([
      { name: "유적왕", costume: COSTUMES[1], isYou: true },
      { name: "Hunter", costume: COSTUMES[1], isYou: false },
      { name: "b", costume: COSTUMES[0], isYou: false },
    ]);
  });
});
