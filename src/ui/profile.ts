import { classForSeat, readClass, type PlayerClass } from "../game/match/classes";
import { COSTUMES, costumeById, type Costume } from "../game/render/costumes";

// Your own look, kept in this browser until the account profile lands on the server.
const STORAGE_KEY = "traitor-hunt:costume";
const listeners = new Set<(costume: Costume) => void>();

function load(): Costume {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return costumeById(id) ?? COSTUMES[0];
  } catch {
    return COSTUMES[0];
  }
}

let current = load();

export function myCostume(): Costume {
  return current;
}

export function setMyCostume(costume: Costume): void {
  current = costume;
  try {
    localStorage.setItem(STORAGE_KEY, costume.id);
  } catch {
    // Without storage the choice still holds until the page closes.
  }
  for (const listener of listeners) listener(current);
}

export function onMyCostume(listener: (costume: Costume) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const CLASS_KEY = "traitor-hunt:class";
const classListeners = new Set<(c: PlayerClass) => void>();

function loadClass(): PlayerClass {
  try {
    return readClass(localStorage.getItem(CLASS_KEY)) ?? classForSeat(0);
  } catch {
    return classForSeat(0);
  }
}

let currentClass = loadClass();

export function myClass(): PlayerClass {
  return currentClass;
}

export function setMyClass(next: PlayerClass): void {
  currentClass = next;
  try {
    localStorage.setItem(CLASS_KEY, next);
  } catch {
    // Without storage the choice still holds until the page closes.
  }
  for (const listener of classListeners) listener(currentClass);
}

export function onMyClass(listener: (c: PlayerClass) => void): () => void {
  classListeners.add(listener);
  return () => {
    classListeners.delete(listener);
  };
}
