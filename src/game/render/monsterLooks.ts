import type { MonsterKind } from "../match/types";
import type { MonsterLook } from "./MonsterActor";

// The Mini Legion monsters (Dungeon Mason). Common monsters alternate between the grunt and the
// footman by id, so a crowd is mixed; the boss is the rock golem.
export interface MonsterSkin { model: string; look: MonsterLook }

export const GRUNT: MonsterSkin = {
  model: "grunt",
  look: { height: 1.35, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Attack01", death: "Die" } },
};

export const FOOTMAN: MonsterSkin = {
  model: "footman",
  look: {
    height: 1.3, tint: null,
    clips: { idle: "Footman_Idle", walk: "Footman_Walk", attack: "Footman_Attack01", death: "Footman_Death" },
  },
};

export const GOLEM: MonsterSkin = {
  model: "golem",
  look: { height: 3, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Attack01", death: "Die" } },
};

export const MONSTER_MODELS = [GRUNT.model, FOOTMAN.model, GOLEM.model];

export function skinFor(kind: MonsterKind, id: string): MonsterSkin {
  if (kind === "boss") return GOLEM;
  const n = Number(/(\d+)$/.exec(id)?.[1] ?? 0);
  return n % 2 === 0 ? GRUNT : FOOTMAN;
}
