import { CLASSES, WEAPONS, type PlayerClass } from "../combat/classes";
import { SKILLS } from "../combat/skills";
import type { ShotKind } from "./effects";

// The RPG Character Pack (Quaternius, CC0): one hero model per class, and which of its clips play
// for each thing a player does. The pack has no jump or strafe clips, so those borrow the run.
export interface HeroRig {
  model: string;
  idle: string;
  walk: string;
  run: string;
  attacks: readonly string[];
  // Held while the guard is up.
  guard: string;
  skill: string;
  death: string;
  // Accessory meshes the costume can take off (names as three.js reads them: dots dropped).
  gear: readonly string[];
  // What flies out on an attack (ranged classes), and how far.
  shot: ShotKind | null;
  reach: number;
  // For each skill slot: the ring of light it leaves (size and colour), and how far the one long
  // shot of a narrow ranged skill flies (null for the rest).
  skillFx: readonly { ring: { radius: number; color: number }; shot: number | null }[];
}

type Clips = Omit<HeroRig, "shot" | "reach" | "skillFx">;

const SHOTS: Partial<Record<PlayerClass, ShotKind>> = { ranger: "arrow", wizard: "bolt" };
const RING_COLOR: Record<PlayerClass, number> = {
  warrior: 0xffd27a, ranger: 0x9be37a, wizard: 0xff7a3a, cleric: 0x9df2ff, rogue: 0xb07aff, monk: 0xffe9a8,
};

function rig(c: PlayerClass, clips: Clips): HeroRig {
  const shot = SHOTS[c] ?? null;
  const skillFx = SKILLS[c].map((skill) => ({
    // A narrow skill (a line of arrows, one stab) still shows a small ring at your feet.
    ring: { radius: skill.arc >= Math.PI ? skill.reach : 1.2, color: RING_COLOR[c] },
    shot: shot && skill.arc < Math.PI ? skill.reach : null,
  }));
  return { ...clips, shot, reach: WEAPONS[c].reach, skillFx };
}

const CLIPS: Record<PlayerClass, Clips> = {
  warrior: {
    model: "hero_warrior", idle: "Idle_Weapon", walk: "Walk", run: "Run_Weapon",
    attacks: ["Sword_Attack", "Sword_Attack2", "Punch"], guard: "Idle_Attacking", skill: "Sword_Attack2", death: "Death",
    gear: ["ShoulderPadL", "ShoulderPadR"],
  },
  ranger: {
    model: "hero_ranger", idle: "Idle_Weapon", walk: "Walk", run: "Run_Holding",
    attacks: ["Bow_Shoot"], guard: "Idle_Attacking", skill: "Bow_Draw", death: "Death",
    gear: ["Cloak", "ArmGuardL", "ArmGuardR", "Pouch"],
  },
  wizard: {
    model: "hero_wizard", idle: "Idle_Weapon", walk: "Walk", run: "Run_Weapon",
    attacks: ["Spell1"], guard: "Idle_Attacking", skill: "Spell2", death: "Death",
    gear: ["ShoulderPadL", "ShoulderPadR", "Pouch"],
  },
  cleric: {
    model: "hero_cleric", idle: "Idle_Weapon", walk: "Walk", run: "Run",
    attacks: ["Staff_Attack", "Punch"], guard: "RecieveHit_Attacking", skill: "Spell1", death: "Death",
    gear: ["ShoulderPads"],
  },
  rogue: {
    model: "hero_rogue", idle: "Idle", walk: "Walk", run: "Run",
    attacks: ["Dagger_Attack", "Dagger_Attack2", "Punch"], guard: "Attacking_Idle", skill: "Dagger_Attack2", death: "Death",
    gear: ["Guard", "Belt", "Pouch"],
  },
  monk: {
    model: "hero_monk", idle: "Idle", walk: "Walk", run: "Run",
    attacks: ["Attack", "Attack2"], guard: "Idle_Attacking", skill: "Attack2", death: "Death",
    gear: [],
  },
};

export const HEROES = Object.fromEntries(CLASSES.map((c) => [c, rig(c, CLIPS[c])])) as Record<PlayerClass, HeroRig>;

export const HERO_MODELS = CLASSES.map((c) => HEROES[c].model);

// Weapon meshes carry their own texture; the costume's weapon colour repaints them.
export function isWeaponMesh(name: string): boolean {
  return /(Sword|Bow|Staff|Dagger)$/.test(name);
}
