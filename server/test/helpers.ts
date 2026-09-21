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
