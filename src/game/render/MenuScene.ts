import * as THREE from "three";
import { ModelLibrary } from "../assets/ModelLibrary";
import type { MonsterState } from "../match/types";
import { RUINS, TILE_SIZE, parseLevel } from "../rules/levelLayout";
import { COSTUME_MODELS, type Costume } from "./costumes";
import { createLabel, setLabel } from "./labels";
import { LEVEL_MODELS, buildLevelScene } from "./levelScene";
import { LightPool } from "./lightPool";
import { MonsterActor } from "./MonsterActor";
import { PlayerActor } from "./PlayerActor";
import { GRUNT, MONSTER_MODELS } from "./monsterLooks";
import { settings } from "../../ui/settings";

const MENU_MODELS = [...new Set([...LEVEL_MODELS, ...COSTUME_MODELS, ...MONSTER_MODELS])];
const LIGHT_SLOTS = 6;

// Party slots in the start room, facing the camera (yaw π faces +z). Slot 0 is you, in front.
const SLOTS = [
  { x: 28.9, z: 11.4, yaw: Math.PI + 0.25 },
  { x: 27.5, z: 10.2, yaw: Math.PI + 0.35 },
  { x: 30.3, z: 10.2, yaw: Math.PI - 0.1 },
  { x: 26.1, z: 9.2, yaw: Math.PI + 0.45 },
];
const LABEL_HEIGHT = 2.05;

export interface PartyMember { name: string; costume: Costume; isYou: boolean }
const SQUAD_LIGHT = new THREE.Vector3(29.2, 2.6, 13.8);
// You stand right of centre, leaving the left side to the menu.
const CAMERA_HOME = new THREE.Vector3(28.6, 1.45, 15.4);
const CAMERA_LOOK = new THREE.Vector3(27.5, 1.05, 11.2);
// A zombie shuffles across the far end of the room now and then.
const ZOMBIE_PATH = { fromX: 6, toX: 40, z: 6.5, speed: 1.1, restSeconds: 9 };
const ENTER_SECONDS = 0.7;

// The 3D backdrop of the main menu: the ruin, the costumed squad and a passing zombie.
export class MenuScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
  private readonly clock = new THREE.Clock();
  private readonly lights = new LightPool(this.scene, LIGHT_SLOTS);
  private readonly resizeObserver: ResizeObserver;
  private resizeFrame = 0;
  private library: ModelLibrary | null = null;
  // One actor per slot, rebuilt when the member in that slot changes.
  private readonly slots: ({ key: string; actor: PlayerActor; label: THREE.Sprite } | null)[] = SLOTS.map(() => null);
  private party: PartyMember[] = [];
  private zombie: MonsterActor | null = null;
  private readonly zombieState: MonsterState = {
    kind: "zombie", x: ZOMBIE_PATH.fromX, z: ZOMBIE_PATH.z, yaw: -Math.PI / 2, hp: 100,
    alive: true, possessed: false, stunnedUntil: 0, attackReadyAt: 0,
  };
  private zombieWait = 3;
  private entering: { t: number; done: () => void } | null = null;
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
    const layout = parseLevel(RUINS, TILE_SIZE);
    buildLevelScene(this.scene, library, layout, this.lights);
    // A warm lamp on the squad so they read against the dark room.
    this.lights.add({
      position: SQUAD_LIGHT, color: new THREE.Color(0xffb070), range: 9,
      intensity: () => 30 + Math.sin(this.clock.elapsedTime * 7) * 2,
    });
    this.library = library;
    this.placeParty();
    this.zombie = new MonsterActor("menu-zombie", library.instance(GRUNT.model), library.get(GRUNT.model).animations, GRUNT.look);
    this.scene.add(this.zombie.object);
    this.clock.start();
    this.frame = requestAnimationFrame(this.tick);
  }

  // Shows you and your party; members beyond the slots are not drawn.
  setParty(members: PartyMember[]): void {
    this.party = members;
    this.placeParty();
  }

  private placeParty(): void {
    const library = this.library;
    if (!library) return;
    SLOTS.forEach((spot, i) => {
      const member = this.party[i];
      const key = member ? `${member.name}|${member.costume.id}` : "";
      const current = this.slots[i];
      if (current?.key === key) return;
      if (current) {
        this.scene.remove(current.actor.object, current.label);
        this.slots[i] = null;
      }
      if (!member) return;
      const model = member.costume.model;
      const actor = new PlayerActor(`menu-${i}`, { object: library.instance(model), clips: library.get(model).animations });
      const label = createLabel(0.9);
      label.position.set(spot.x, LABEL_HEIGHT, spot.z);
      setLabel(label, member.name, member.isYou ? "#ffd9a0" : "#f2e8d5");
      this.scene.add(actor.object, label);
      this.slots[i] = { key, actor, label };
    });
  }

  // Pushes the camera into the room, then calls done.
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

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    SLOTS.forEach((spot, i) => this.slots[i]?.actor.sync({ x: spot.x, z: spot.z, yaw: spot.yaw }, "active", dt));
    this.moveZombie(dt);

    // A slow handheld drift, then a push forward when a game starts.
    this.camera.position.set(
      CAMERA_HOME.x + Math.sin(t * 0.21) * 0.25,
      CAMERA_HOME.y + Math.sin(t * 0.37) * 0.04,
      CAMERA_HOME.z + Math.cos(t * 0.17) * 0.15,
    );
    if (this.entering) {
      this.entering.t += dt / ENTER_SECONDS;
      const k = Math.min(1, this.entering.t) ** 2;
      this.camera.position.lerp(CAMERA_LOOK, k * 0.75);
      if (this.entering.t >= 1) {
        const done = this.entering.done;
        this.entering = null;
        done();
      }
    }
    this.camera.lookAt(CAMERA_LOOK);
    this.renderer.toneMappingExposure = settings().brightness;
    this.lights.update(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  };

  private moveZombie(dt: number): void {
    const zombie = this.zombie;
    if (!zombie) return;
    const state = this.zombieState;
    if (this.zombieWait > 0) {
      this.zombieWait -= dt;
      zombie.sync(state, dt, true);
      return;
    }
    state.x += ZOMBIE_PATH.speed * dt;
    if (state.x > ZOMBIE_PATH.toX) {
      state.x = ZOMBIE_PATH.fromX;
      this.zombieWait = ZOMBIE_PATH.restSeconds;
    }
    zombie.sync(state, dt, false);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
