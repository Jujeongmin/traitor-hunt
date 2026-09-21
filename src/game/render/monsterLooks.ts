import type { MonsterKind } from "../match/types";
import type { MonsterLook } from "./MonsterActor";

// The Ultimate Monsters pack (Quaternius, CC0). Common monsters take turns by id, so a crowd is
// mixed; the boss is the mushroom king, lord of the forest.
export interface MonsterSkin { model: string; look: MonsterLook }

const blob = (model: string): MonsterSkin => ({
  model,
  look: { height: 0.9, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Bite_Front", death: "Death" } },
});

export const GREEN_BLOB = blob("mon_green_blob");
export const MUSHNUB = blob("mon_mushnub");

export const GOLELING: MonsterSkin = {
  model: "mon_goleling",
  look: { height: 1.1, tint: null, clips: { idle: "Flying_Idle", walk: "Fast_Flying", attack: "Headbutt", death: "Death" } },
};

export const BAT: MonsterSkin = {
  model: "mon_bat",
  look: { height: 0.9, tint: null, clips: { idle: "Flying", walk: "Flying", attack: "Bite_Front", death: "Death" } },
};

export const MUSHROOM_KING: MonsterSkin = {
  model: "mon_mushroom_king",
  look: { height: 2.8, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Weapon", death: "Death" } },
};

const COMMON = [GREEN_BLOB, MUSHNUB, GOLELING, BAT];

export const MONSTER_MODELS = [...COMMON.map((s) => s.model), MUSHROOM_KING.model];

export function skinFor(kind: MonsterKind, id: string): MonsterSkin {
  if (kind === "boss") return MUSHROOM_KING;
  const n = Number(/(\d+)$/.exec(id)?.[1] ?? 0);
  return COMMON[n % COMMON.length];
}
