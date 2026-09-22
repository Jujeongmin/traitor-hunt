import type { MonsterType } from "../world/monsters";
import type { ItemId } from "./items";

// The village's quests, taken one after another: each asks for a number of monsters of some kinds,
// and pays XP, gold and sometimes an item when claimed. A character keeps which quest it is on and
// how many it has felled for it.

export interface Quest {
  name: string;
  // What to do, in a line.
  goal: string;
  targets: MonsterType[];
  count: number;
  xp: number;
  gold: number;
  items: { id: ItemId; n: number }[];
}

export const QUESTS: readonly Quest[] = [
  { name: "슬라임 퇴치", goal: "숲 필드 1의 초록 슬라임 15마리", targets: ["green_blob"], count: 15, xp: 250, gold: 40, items: [{ id: "potion_small", n: 5 }] },
  { name: "버섯돌이 소탕", goal: "숲 필드 1의 버섯돌이 20마리", targets: ["mushnub"], count: 20, xp: 700, gold: 80, items: [] },
  { name: "들판의 골칫거리", goal: "들쥐나 개구리 40마리", targets: ["rat", "frog"], count: 40, xp: 2500, gold: 200, items: [{ id: "armor_1", n: 1 }] },
  { name: "깊은 숲 정찰", goal: "숲 필드 2의 숲거미나 독사 50마리", targets: ["spider", "snake"], count: 50, xp: 9000, gold: 600, items: [{ id: "potion_big", n: 5 }] },
  { name: "하늘의 사냥", goal: "말벌이나 박쥐 60마리", targets: ["wasp", "bat"], count: 60, xp: 18000, gold: 1000, items: [] },
  { name: "돌의 정령", goal: "골렘링 60마리", targets: ["goleling"], count: 60, xp: 30000, gold: 1500, items: [{ id: "weapon_2", n: 1 }] },
  { name: "버섯왕 토벌", goal: "버섯왕의 공터의 버섯왕", targets: ["mushroom_king"], count: 1, xp: 40000, gold: 3000, items: [] },
  { name: "깊은 숲의 거미굴", goal: "깊은 숲의 거대 독거미나 맹독사 60마리", targets: ["dire_spider", "venom_snake"], count: 60, xp: 60000, gold: 4000, items: [{ id: "potion_big", n: 10 }] },
  { name: "하늘을 덮은 날개", goal: "장수말벌이나 흡혈박쥐 80마리", targets: ["hornet", "vampire_bat"], count: 80, xp: 90000, gold: 6000, items: [] },
  { name: "숲의 수호석", goal: "바위 골렘 60마리", targets: ["stone_golem"], count: 60, xp: 130000, gold: 9000, items: [{ id: "armor_2", n: 1 }] },
];

// Where a character is in the chain: the quest it is on (QUESTS.length when all are done) and how
// many it has felled for it.
export interface QuestProgress { index: number; count: number }

export const QUEST_START: QuestProgress = { index: 0, count: 0 };

export function readQuest(raw: unknown): QuestProgress {
  const q = (raw ?? {}) as Record<string, unknown>;
  const whole = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
  const index = Math.min(whole(q.index), QUESTS.length);
  const quest = QUESTS[index];
  return { index, count: quest ? Math.min(whole(q.count), quest.count) : 0 };
}

// Progress after felling these monsters.
export function countKills(progress: QuestProgress, felled: readonly MonsterType[]): QuestProgress {
  const quest = QUESTS[progress.index];
  if (!quest) return progress;
  const hits = felled.filter((t) => quest.targets.includes(t)).length;
  return hits === 0 ? progress : { ...progress, count: Math.min(quest.count, progress.count + hits) };
}

export function questDone(progress: QuestProgress): boolean {
  const quest = QUESTS[progress.index];
  return !!quest && progress.count >= quest.count;
}
