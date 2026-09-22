import { npcSpot } from "../../src/game/world/npcs";

export const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error: any) {
    return String(error?.message ?? error);
  }
}


// Makes a character on the account's server and plays it.
export async function makeCharacter(server: any, account: string, name: string, playerClass = "warrior", costume = "0000"): Promise<any> {
  server.connect({ account });
  return server.createCharacter(name, playerClass, costume);
}

// Sets the XP of an account's active character, as hunting will.
export async function giveXp(account: string, xp: number): Promise<void> {
  const state = await $global.getUserState(account);
  const map = { ...state.characterMap };
  map[state.active] = { ...map[state.active], xp };
  await $global.updateUserState(account, { characterMap: map });
}

// What the client does after enterWorld or travel under Verse8 2.0: joins the room it was given
// (the test runner stands in for the platform) and calls arrive from inside it.
export async function join(server: any, account: string, entry: { roomId: string }, from?: string): Promise<any> {
  if (from) await server.simulateLeave(from, account);
  await server.simulateJoin(entry.roomId, account);
  server.connect({ account, roomId: entry.roomId });
  await server.arrive();
  return entry;
}

// Into the world with the active character, as the client does it.
export async function enterAs(server: any, account: string): Promise<any> {
  server.connect({ account });
  return join(server, account, await server.enterWorld());
}

// Stands the caller next to a village NPC (the shop's merchant, the quests' elder).
export async function toNpc(server: any, id: "merchant" | "elder" | "smith"): Promise<void> {
  const spot = npcSpot(id);
  await walkTo(server, spot.x + 1, spot.z);
}

// Moves the caller straight to (x, z), as a long walk would: the last pose is made old enough that
// the server's walking-pace check lets the report through.
export async function walkTo(server: any, x: number, z: number, yaw = 0): Promise<void> {
  const mine = await $room.getMyState();
  await $room.updateMyState({ pose: { ...mine.pose, at: 0 } });
  await server.reportPose({ x, z, yaw });
}
