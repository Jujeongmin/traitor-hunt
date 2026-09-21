export const PLAYERS = ["test-a", "test-b", "test-c", "test-d"];

export async function errorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error: any) {
    return String(error?.message ?? error);
  }
}

// Connects as `account`, standing in `roomId` (the room enterWorld or travel returned).
export function inRoom(server: any, account: string, roomId: string): any {
  server.connect({ account, roomId });
  return server;
}

// Makes a character on the account's server and plays it.
export async function makeCharacter(server: any, account: string, name: string, playerClass = "warrior", costume = "0000"): Promise<any> {
  server.connect({ account });
  return server.createCharacter(name, playerClass, costume);
}

// Sets the XP of an account's active character, as hunting will.
export async function giveXp(account: string, xp: number): Promise<void> {
  const state = await $global.getUserState(account);
  const characters = (state.characters as any[]).map((c) => (c.id === state.active ? { ...c, xp } : c));
  await $global.updateUserState(account, { characters });
}
