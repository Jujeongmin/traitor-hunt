import type { Point2 } from "../rules/levelLayout";
import { START_ZONE, ZONES, zoneLayout } from "./zones";

// The people of the village: the merchant keeps the shop, the elder hands out the quests and takes
// your reports. Each stands outside the door of a building of the village, the same spot for everyone.
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
  // Colours laid over the model's materials, by material name (the pack's skin comes out black).
  colors: Record<string, number>;
  // The building they stand in front of: the top-left cell of its block (see VILLAGE_HOUSES in zones.ts).
  house: [number, number];
}

export const NPCS: readonly Npc[] = [
  // Villagers from Quaternius's Ultimate Animated Character Pack (CC0): an old gentleman in a top
  // hat keeps the shop, an old lady is the elder. Nobody can play them, so they never look like
  // another player.
  {
    id: "merchant", name: "상인 한스", role: "상점", model: "npc_merchant", height: 1.75, idle: "Idle", greet: "Victory",
    colors: { Skin: 0xe8b98f, Shirt: 0xeee6d6, Pants: 0x5b4a2e, Detail: 0x9a5424 },
    house: [10, 5],
  },
  {
    id: "elder", name: "촌장 마르타", role: "퀘스트", model: "npc_elder", height: 1.6, idle: "Idle", greet: "Victory",
    colors: { Skin: 0xf0c9a4, Shirt: 0x7d5a9e, Pants: 0x4e3d63, Hair: 0xd9d4cc, Hat: 0x3b2a4a },
    house: [15, 6],
  },
];

// Standing this close to someone lets you talk to them (the server allows a little more for lag).
export const TALK_RANGE = 3.5;
export const NPC_MODELS = NPCS.map((n) => n.model);
export const TALK_SLACK = 2.5;

const spots = new Map<NpcId, Point2>();

// How far in front of a building's middle an NPC stands: just outside its block, by the door.
const DOOR_OUT = 5;
const FACING = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] } as const;

// Where an NPC stands in the village: outside the door of their building.
export function npcSpot(id: NpcId): Point2 {
  const cached = spots.get(id);
  if (cached) return cached;
  const npc = NPCS.find((n) => n.id === id)!;
  const house = (ZONES[START_ZONE].houses ?? []).find((h) => h.at[0] === npc.house[0] && h.at[1] === npc.house[1]);
  if (!house) throw new Error(`no building at ${npc.house.join(",")} for ${id}`);
  const t = zoneLayout(START_ZONE).tileSize;
  const [dx, dz] = FACING[house.face];
  const spot = { x: (house.at[0] + 1) * t + dx * DOOR_OUT, z: (house.at[1] + 1) * t + dz * DOOR_OUT };
  spots.set(id, spot);
  return spot;
}

// Which way an NPC looks: out from their door, as a unit step in x and z.
export function npcFacing(id: NpcId): Point2 {
  const npc = NPCS.find((n) => n.id === id)!;
  const house = (ZONES[START_ZONE].houses ?? []).find((h) => h.at[0] === npc.house[0] && h.at[1] === npc.house[1])!;
  const [x, z] = FACING[house.face];
  return { x, z };
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
