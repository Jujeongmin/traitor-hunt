import type { Point2 } from "../rules/levelLayout";
import { START_ZONE, zoneLayout } from "./zones";

// The people of the village: the merchant keeps the shop, the elder hands out the quests and takes
// your reports. They stand a few steps from where you arrive, the same spot for everyone.
export type NpcId = "merchant" | "elder";

export interface Npc {
  id: NpcId;
  name: string;
  // What they do, under their name.
  role: string;
  // Their own model (not a player class's hero), how tall it stands, and its clips (see NpcActor).
  model: string;
  height: number;
  idle: string;
  greet: string;
  // Where they stand, in cells from the village spawn (the nearest open cell to it is used).
  offset: [number, number];
}

export const NPCS: readonly Npc[] = [
  // A rabbit shopkeeper (Quaternius Ultimate Monsters, Big/Bunny) and a blob wizard for the elder
  // (Blob/Wizard), CC0: nobody can play them, so they never look like another player.
  {
    id: "merchant", name: "상인 한스", role: "상점", model: "npc_merchant", height: 1.6, idle: "Idle", greet: "Wave",
    offset: [2, -2],
  },
  {
    id: "elder", name: "촌장 마르타", role: "퀘스트", model: "npc_elder", height: 1.3, idle: "Idle", greet: "Yes",
    offset: [-2, -2],
  },
];

// Standing this close to someone lets you talk to them (the server allows a little more for lag).
export const TALK_RANGE = 3.5;
export const NPC_MODELS = NPCS.map((n) => n.model);
export const TALK_SLACK = 2.5;

const spots = new Map<NpcId, Point2>();

// Where an NPC stands in the village: the open cell nearest their offset from the spawn, at its centre.
export function npcSpot(id: NpcId): Point2 {
  const cached = spots.get(id);
  if (cached) return cached;
  const npc = NPCS.find((n) => n.id === id)!;
  const layout = zoneLayout(START_ZONE);
  const t = layout.tileSize;
  const sc = Math.floor(layout.playerSpawn.x / t) + npc.offset[0];
  const sr = Math.floor(layout.playerSpawn.z / t) + npc.offset[1];
  let best: { c: number; r: number; d: number } | null = null;
  for (let r = 1; r < layout.rows - 1; r++) {
    for (let c = 1; c < layout.cols - 1; c++) {
      if (layout.solid[r][c]) continue;
      // Not on a platform, a portal or the spawn itself.
      const centre = { x: (c + 0.5) * t, z: (r + 0.5) * t };
      if (layout.platforms.some((p) => Math.abs(p.x - centre.x) < t && Math.abs(p.z - centre.z) < t)) continue;
      if (layout.portals.some((p) => Math.hypot(p.x - centre.x, p.z - centre.z) < t * 2)) continue;
      if (c === Math.floor(layout.playerSpawn.x / t) && r === Math.floor(layout.playerSpawn.z / t)) continue;
      const d = Math.hypot(c - sc, r - sr);
      if (!best || d < best.d) best = { c, r, d };
    }
  }
  const spot = { x: (best!.c + 0.5) * t, z: (best!.r + 0.5) * t };
  spots.set(id, spot);
  return spot;
}

// The NPC within talking range of (x, z), nearest first; null when nobody is.
export function npcNear(x: number, z: number, slack = 0): NpcId | null {
  let best: { id: NpcId; d: number } | null = null;
  for (const npc of NPCS) {
    const spot = npcSpot(npc.id);
    const d = Math.hypot(spot.x - x, spot.z - z);
    if (d <= TALK_RANGE + slack && (!best || d < best.d)) best = { id: npc.id, d };
  }
  return best?.id ?? null;
}
