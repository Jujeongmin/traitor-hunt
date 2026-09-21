import * as THREE from "three";
import { ModelLibrary } from "../assets/ModelLibrary";
import { CLASSES, type PlayerClass } from "../combat/classes";
import type { MonsterState } from "../world/types";
import { zoneLayout } from "../world/zones";
import { COSTUMES, type Costume } from "./costumes";
import { HEROES, HERO_MODELS } from "./heroes";
import { createLabel, setLabel } from "./labels";
import { LEVEL_MODELS, buildLevelScene } from "./levelScene";
import { MonsterActor } from "./MonsterActor";
import { PlayerActor } from "./PlayerActor";
import { GREEN_BLOB, MONSTER_MODELS } from "./monsterLooks";
import { settings } from "../../ui/settings";

const MENU_MODELS = [...new Set([...LEVEL_MODELS, ...HERO_MODELS, ...MONSTER_MODELS])];

// Everything stands in the village square, facing the camera (yaw π faces +z).
const FACING = Math.PI;
// You and your party, you in front.
const SLOTS = [
  { x: 26.6, z: 17.4, yaw: FACING + 0.15 },
  { x: 25.1, z: 16.3, yaw: FACING + 0.3 },
  { x: 28.1, z: 16.3, yaw: FACING - 0.15 },
  { x: 23.7, z: 15.5, yaw: FACING + 0.4 },
];
// The six classes in a row, for picking one.
const LINEUP_Z = 16.2;
const LINEUP_GAP = 1.3;
const LINEUP_X = 26.2;
// The picked hero steps this far forward.
const STEP_OUT = 0.9;
const LABEL_HEIGHT = 1.95;

export interface PartyMember { name: string; costume: Costume; playerClass: PlayerClass; isYou: boolean }

type Mode = "party" | "lineup";

const CAMERA_HOME = new THREE.Vector3(26.4, 1.55, 22.6);
const CAMERA_LOOK = new THREE.Vector3(26.2, 0.95, 16.4);
// Picking a class: the row stands in the middle, high enough to clear the panel along the bottom.
const LINEUP_CAMERA = new THREE.Vector3(26.2, 1.25, 23.6);
const LINEUP_LOOK = new THREE.Vector3(26.2, -0.35, 16.2);
// The wardrobe: the camera closes in on you, standing left of the screen's middle so the panel on
// the right does not cover you.
const WARDROBE_CAMERA = new THREE.Vector3(27.2, 1.0, 20.9);
const WARDROBE_LOOK = new THREE.Vector3(27.9, 0.75, 17.4);
const FOCUS_RATE = 5;
const ENTER_SECONDS = 0.7;
// A slime hops across the back of the square now and then.
const SLIME_PATH = { fromX: 8, toX: 46, z: 10.5, speed: 1.2, restSeconds: 7 };

// The 3D backdrop of the menus: the village square, and either your party or the six classes to
// choose from.
export class MenuScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 90);
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private resizeFrame = 0;
  private library: ModelLibrary | null = null;
  private mode: Mode = "lineup";
  // One actor per party slot, rebuilt when the member in that slot changes.
  private readonly slots: ({ key: string; actor: PlayerActor; label: THREE.Sprite } | null)[] = SLOTS.map(() => null);
  private party: PartyMember[] = [];
  private readonly lineup = new Map<PlayerClass, { actor: PlayerActor; label: THREE.Sprite; step: number }>();
  private picked: PlayerClass | null = null;
  private slime: MonsterActor | null = null;
  private readonly slimeState: MonsterState = {
    kind: "zombie", x: SLIME_PATH.fromX, z: SLIME_PATH.z, yaw: -Math.PI / 2, hp: 100,
    alive: true, stunnedUntil: 0, attackReadyAt: 0,
  };
  private slimeWait = 2;
  private entering: { t: number; done: () => void } | null = null;
  // 0 on the menu, 1 in the wardrobe; eased toward focusTarget.
  private focus = 0;
  private focusTarget = 0;
  // 0 showing the party, 1 showing the row of classes; eased like focus.
  private rowView = 1;
  // How far you have turned your hero by dragging, in the wardrobe.
  private spinYaw = 0;
  private readonly look = new THREE.Vector3();
  private readonly home = new THREE.Vector3();
  private frame = 0;
  private disposed = false;

  constructor(private readonly container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(CAMERA_LOOK);
    // Resize on the next frame, not inside the observer callback, so the browser never reports a ResizeObserver loop.
    this.resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.resize());
    });
    this.resizeObserver.observe(container);
    this.resize();
  }

  async start(onProgress?: (done: number, total: number) => void): Promise<void> {
    const library = await ModelLibrary.load();
    await library.preload(MENU_MODELS, onProgress);
    if (this.disposed) return;
    buildLevelScene(this.scene, library, zoneLayout("village"));
    this.library = library;
    this.buildLineup();
    this.placeParty();
    this.slime = new MonsterActor("menu-slime", library.instance(GREEN_BLOB.model), library.get(GREEN_BLOB.model).animations, GREEN_BLOB.look);
    this.scene.add(this.slime.object);
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  // The six classes in a row (for a new character), or you and your party.
  setMode(mode: Mode): void {
    this.mode = mode;
  }

  // The class stepping out of the row; null for none.
  setPicked(picked: PlayerClass | null): void {
    this.picked = picked;
  }

  // Which class's hero is under a point on the screen (client pixels), in the row.
  classAt(clientX: number, clientY: number): PlayerClass | null {
    if (this.mode !== "lineup") return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    let best: { c: PlayerClass; d: number } | null = null;
    for (const [c, { actor }] of this.lineup) {
      // A box round each hero is easier to hit than its thin limbs.
      const box = new THREE.Box3().setFromObject(actor.object).expandByScalar(0.15);
      const hit = this.raycaster.ray.intersectBox(box, new THREE.Vector3());
      if (hit) {
        const d = hit.distanceTo(this.camera.position);
        if (!best || d < best.d) best = { c, d };
      }
    }
    return best?.c ?? null;
  }

  // Shows you and your party; members beyond the slots are not drawn.
  setParty(members: PartyMember[]): void {
    this.party = members;
    this.placeParty();
  }

  // The wardrobe view: close on your hero, the rest of the squad out of sight.
  setWardrobe(on: boolean): void {
    this.focusTarget = on ? 1 : 0;
    if (!on) this.spinYaw = 0;
  }

  // Turns your hero on the spot while you drag in the wardrobe.
  spin(radians: number): void {
    this.spinYaw += radians;
  }

  // Pushes the camera toward the square, then calls done.
  enter(done: () => void): void {
    this.entering = { t: 0, done };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.resizeFrame);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildLineup(): void {
    const library = this.library!;
    CLASSES.forEach((c) => {
      const rig = HEROES[c];
      const actor = new PlayerActor(`lineup-${c}`, {
        object: library.instance(rig.model), clips: library.get(rig.model).animations, costume: COSTUMES[0], rig,
      });
      const label = createLabel(1.1);
      this.scene.add(actor.object, label);
      this.lineup.set(c, { actor, label, step: 0 });
    });
  }

  private placeParty(): void {
    const library = this.library;
    if (!library) return;
    SLOTS.forEach((spot, i) => {
      const member = this.party[i];
      const key = member ? `${member.name}|${member.playerClass}|${member.costume.id}` : "";
      const current = this.slots[i];
      if (current?.key === key) return;
      if (current) {
        this.scene.remove(current.actor.object, current.label);
        this.slots[i] = null;
      }
      if (!member) return;
      const rig = HEROES[member.playerClass];
      const actor = new PlayerActor(`menu-${i}`, {
        object: library.instance(rig.model), clips: library.get(rig.model).animations, costume: member.costume, rig,
      });
      const label = createLabel(0.9);
      label.position.set(spot.x, LABEL_HEIGHT, spot.z);
      setLabel(label, member.name, member.isYou ? "#ffd9a0" : "#f2e8d5");
      this.scene.add(actor.object, label);
      this.slots[i] = { key, actor, label };
    });
  }

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const lineup = this.mode === "lineup";

    this.focus += (this.focusTarget - this.focus) * (1 - Math.exp(-dt * FOCUS_RATE));
    CLASSES.forEach((c, i) => {
      const entry = this.lineup.get(c);
      if (!entry) return;
      entry.step += ((this.picked === c ? STEP_OUT : 0) - entry.step) * (1 - Math.exp(-dt * 8));
      const x = LINEUP_X + (i - (CLASSES.length - 1) / 2) * LINEUP_GAP;
      const z = LINEUP_Z + entry.step;
      entry.actor.sync(lineup ? { x, z, yaw: FACING } : null, "active", dt);
      entry.label.position.set(x, LABEL_HEIGHT, z);
    });
    SLOTS.forEach((spot, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      // In the wardrobe only you stay in view, turned toward the camera and by your drag.
      const hidden = lineup || (i > 0 && this.focus > 0.5);
      const yaw = i === 0 ? spot.yaw + (FACING + 0.25 - spot.yaw) * this.focus + this.spinYaw : spot.yaw;
      slot.actor.sync(hidden ? null : { x: spot.x, z: spot.z, yaw }, "active", dt);
      slot.label.visible = !hidden && this.focus < 0.5;
    });
    this.moveSlime(dt);

    // A slow handheld drift, then a push forward when a game starts; the wardrobe closes in.
    this.home.set(
      CAMERA_HOME.x + Math.sin(t * 0.21) * 0.2,
      CAMERA_HOME.y + Math.sin(t * 0.37) * 0.04,
      CAMERA_HOME.z + Math.cos(t * 0.17) * 0.12,
    );
    this.rowView += ((lineup ? 1 : 0) - this.rowView) * (1 - Math.exp(-dt * FOCUS_RATE));
    this.camera.position.copy(this.home).lerp(LINEUP_CAMERA, this.rowView).lerp(WARDROBE_CAMERA, this.focus);
    this.look.copy(CAMERA_LOOK).lerp(LINEUP_LOOK, this.rowView).lerp(WARDROBE_LOOK, this.focus);
    if (this.entering) {
      this.entering.t += dt / ENTER_SECONDS;
      const k = Math.min(1, this.entering.t) ** 2;
      this.camera.position.lerp(this.look, k * 0.75);
      if (this.entering.t >= 1) {
        const done = this.entering.done;
        this.entering = null;
        done();
      }
    }
    this.camera.lookAt(this.look);
    this.renderer.toneMappingExposure = settings().brightness;
    this.renderer.render(this.scene, this.camera);
  };

  private moveSlime(dt: number): void {
    const slime = this.slime;
    if (!slime) return;
    const state = this.slimeState;
    if (this.slimeWait > 0) {
      this.slimeWait -= dt;
      slime.sync(state, dt, true);
      return;
    }
    state.x += SLIME_PATH.speed * dt;
    if (state.x > SLIME_PATH.toX) {
      state.x = SLIME_PATH.fromX;
      this.slimeWait = SLIME_PATH.restSeconds;
    }
    slime.sync(state, dt, false);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
