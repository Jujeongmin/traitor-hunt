import { TILE_SIZE, parseLevel, type LevelLayout, type Point2 } from "../rules/levelLayout";
import { fieldMap } from "./fieldMap";

// The open world: a village, two forest fields and the boss's clearing, joined by portals (O cells).
// Each zone runs as channels of at most CHANNEL_CAPACITY players (one Verse8 room each). The
// village and the first field are free; the rest open with the full game.
export type ZoneId = "village" | "forest1" | "forest2" | "forest3" | "boss";

export interface Zone {
  id: ZoneId;
  name: string;
  // Needs the full game bought.
  paid: boolean;
  // The level a character needs to go in.
  minLevel: number;
  // # forest, . ground, P where you appear when nothing else says, O a portal, Z a monster's spot,
  // K the boss's spot, c B C H things to stand on (see levelLayout.ts).
  map: string[];
  // Where each O leads, in reading order.
  portals: ZoneId[];
}

// The fields are wide open country (drawn by fieldMap from a few numbers): about 200 by 140 metres
// of meadow and groves between walls of forest, the village a little smaller.
export const ZONES: Record<ZoneId, Zone> = {
  village: {
    id: "village", name: "초록숲 마을", paid: false, minLevel: 1, portals: ["forest1"],
    map: fieldMap({
      cols: 34, rows: 26, seed: 3, spawn: [14, 13], portals: [{ side: "E", at: 13 }],
      monsters: 0, groves: 5, edge: 2, props: "cBCHcBcC",
    }),
  },
  forest1: {
    id: "forest1", name: "숲 필드 1", paid: false, minLevel: 1, portals: ["village", "forest2"],
    map: fieldMap({
      cols: 50, rows: 36, seed: 11, spawn: [5, 18], portals: [{ side: "W", at: 18 }, { side: "E", at: 17 }],
      monsters: 24, groves: 16, edge: 3, props: "cBcCcB",
    }),
  },
  forest2: {
    id: "forest2", name: "숲 필드 2", paid: true, minLevel: 10, portals: ["forest1", "boss", "forest3"],
    map: fieldMap({
      cols: 50, rows: 36, seed: 29, spawn: [5, 17],
      portals: [{ side: "W", at: 17 }, { side: "N", at: 38 }, { side: "E", at: 24 }],
      monsters: 26, groves: 20, edge: 3, props: "cBcCH",
    }),
  },
  forest3: {
    id: "forest3", name: "깊은 숲", paid: true, minLevel: 25, portals: ["forest2"],
    map: fieldMap({
      cols: 54, rows: 40, seed: 61, spawn: [5, 20], portals: [{ side: "W", at: 20 }],
      monsters: 28, groves: 26, edge: 4, props: "cBcCHc",
    }),
  },
  boss: {
    id: "boss", name: "버섯왕의 공터", paid: true, minLevel: 25, portals: ["forest2"],
    map: fieldMap({
      cols: 30, rows: 30, seed: 47, spawn: [15, 25], portals: [{ side: "S", at: 15 }],
      monsters: 0, boss: [15, 11], groves: 4, edge: 3, props: "cc",
    }),
  },
};

// The square the menus stand in: the first village, kept as it was, since the menu's camera and
// lineup are placed on it.
export const MENU_MAP = [
  "#############",
  "#..c.....B..#",
  "#.....#.....#",
  "#..C........#",
  "#....P......O",
  "#...........#",
  "#.H.....c...#",
  "#.......#...#",
  "#############",
];

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];
export const START_ZONE: ZoneId = "village";
export const CHANNEL_CAPACITY = 10;
// Channels are numbered from 1; this many at most per zone and server.
export const MAX_CHANNELS = 50;
// Standing this close to a portal's centre takes you through.
export const PORTAL_RADIUS = 1.4;

export function readZone(value: unknown): ZoneId | null {
  return ZONE_IDS.find((z) => z === value) ?? null;
}

const layouts = new Map<ZoneId, LevelLayout>();

export function zoneLayout(id: ZoneId): LevelLayout {
  let layout = layouts.get(id);
  if (!layout) {
    layout = parseLevel(ZONES[id].map, TILE_SIZE);
    layouts.set(id, layout);
  }
  return layout;
}

export interface Portal extends Point2 { to: ZoneId }

export function portalsOf(id: ZoneId): Portal[] {
  return zoneLayout(id).portals.map((p, i) => ({ ...p, to: ZONES[id].portals[i] }));
}

// Where you stand after coming into `zone` from `from`: one cell inside the portal that leads back,
// so you do not step straight back through it.
export function arrivalFrom(zone: ZoneId, from: ZoneId): Point2 {
  const layout = zoneLayout(zone);
  const back = portalsOf(zone).find((p) => p.to === from);
  if (!back) return layout.playerSpawn;
  const t = layout.tileSize;
  const c = Math.floor(back.x / t);
  const r = Math.floor(back.z / t);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc >= 0 && nr >= 0 && nc < layout.cols && nr < layout.rows && !layout.solid[nr][nc]) {
      return { x: (nc + 0.5) * t, z: (nr + 0.5) * t };
    }
  }
  return layout.playerSpawn;
}

// One Verse8 room per channel; the id says which server, zone and channel it is.
export function channelRoomId(world: string, zone: ZoneId, channel: number): string {
  return `rpg-${world}-${zone}-${channel}`;
}

export function readChannelRoom(roomId: unknown): { world: string; zone: ZoneId; channel: number } | null {
  if (typeof roomId !== "string") return null;
  const m = /^rpg-(w\d+)-([a-z0-9]+)-(\d+)$/.exec(roomId);
  const zone = m ? readZone(m[2]) : null;
  return m && zone ? { world: m[1], zone, channel: Number(m[3]) } : null;
}

// What entering a zone hands back: the room, and where you stand in it.
export interface ZoneEntry {
  roomId: string;
  zone: ZoneId;
  channel: number;
  x: number;
  z: number;
}

// What each player in a zone shows the others, written when they come in.
export interface ZoneLook {
  name: string;
  costume: string;
  playerClass: string;
  level: number;
  // The advanced class's name (전직), shown before the name.
  job: string | null;
}
