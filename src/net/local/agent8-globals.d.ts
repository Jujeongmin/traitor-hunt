// Loose types for the Verse8 server globals, so server/src compiles inside the app and tests
// (LocalWorld installs real implementations at call time). The server project uses the
// official @agent8/gameserver-node types instead.
declare const $global: any;
declare const $room: any;
declare const $sender: { account: string; roomId?: string };
declare function $lock<T>(lockKey: string, fn: () => T | Promise<T>): Promise<T>;
declare const $asset: any;
