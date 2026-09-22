import type { MonsterType } from "../world/monsters";
import type { MonsterLook } from "./MonsterActor";

// How each monster is drawn: its model (Quaternius, see docs/licenses) and which of its clips to play.
export interface MonsterSkin { model: string; look: MonsterLook }

const blob = (model: string): MonsterSkin => ({
  model,
  look: { height: 0.9, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Bite_Front", death: "Death" } },
});

// The small animals' takes: Idle, Walk (or Run), Attack, Death.
const animal = (model: string, height: number, clips: Partial<MonsterLook["clips"]> = {}): MonsterSkin => ({
  model,
  look: { height, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Attack", death: "Death", ...clips } },
});

export const MONSTER_SKINS: Record<MonsterType, MonsterSkin> = {
  green_blob: blob("mon_green_blob"),
  mushnub: blob("mon_mushnub"),
  rat: animal("mon_rat", 0.7),
  // The frog hops everywhere; the snake never dies on screen, it just sinks away (no death take).
  frog: animal("mon_frog", 0.7, { walk: "Jump" }),
  snake: animal("mon_snake", 0.6, { death: null }),
  spider: animal("mon_spider", 0.9),
  wasp: animal("mon_wasp", 0.9, { idle: "Flying", walk: "Flying" }),
  goleling: {
    model: "mon_goleling",
    look: { height: 1.1, tint: null, clips: { idle: "Flying_Idle", walk: "Fast_Flying", attack: "Headbutt", death: "Death" } },
  },
  bat: {
    model: "mon_bat",
    look: { height: 0.9, tint: null, clips: { idle: "Flying", walk: "Flying", attack: "Bite_Front", death: "Death" } },
  },
  // The deep forest's monsters: the second field's models, grown and darkened.
  dire_spider: { model: "mon_spider", look: { height: 1.4, tint: 0x8a5ad0, clips: { idle: "Idle", walk: "Walk", attack: "Attack", death: "Death" } } },
  venom_snake: { model: "mon_snake", look: { height: 0.9, tint: 0x6fe070, clips: { idle: "Idle", walk: "Walk", attack: "Attack", death: null } } },
  hornet: { model: "mon_wasp", look: { height: 1.3, tint: 0xff9a40, clips: { idle: "Flying", walk: "Flying", attack: "Attack", death: "Death" } } },
  vampire_bat: {
    model: "mon_bat", look: { height: 1.3, tint: 0xe05050, clips: { idle: "Flying", walk: "Flying", attack: "Bite_Front", death: "Death" } },
  },
  stone_golem: {
    model: "mon_goleling", look: { height: 2.0, tint: 0x9aa0a8, clips: { idle: "Flying_Idle", walk: "Fast_Flying", attack: "Headbutt", death: "Death" } },
  },
  mushnub_guard: {
    model: "mon_mushnub", look: { height: 1.3, tint: 0xd07060, clips: { idle: "Idle", walk: "Walk", attack: "Bite_Front", death: "Death" } },
  },
  mushroom_king: {
    model: "mon_mushroom_king",
    look: { height: 2.8, tint: null, clips: { idle: "Idle", walk: "Walk", attack: "Weapon", death: "Death" } },
  },
};

export const GREEN_BLOB = MONSTER_SKINS.green_blob;

export const MONSTER_MODELS = [...new Set(Object.values(MONSTER_SKINS).map((s) => s.model))];
