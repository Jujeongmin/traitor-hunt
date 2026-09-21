import * as THREE from "three";
import type { ModelLibrary } from "../assets/ModelLibrary";
import { MATCH_PLAYERS, PLATE_RADIUS, SEAL_DURATION_MS } from "../match/constants";
import { isActive } from "../match/lifecycle";
import type { PublicMatch } from "../match/types";
import type { LevelLayout, Point2 } from "../rules/levelLayout";
import { altarRing } from "../rules/obstacles";
import { createLabel, setLabel } from "./labels";
import type { LightPool } from "./lightPool";
import { buildStaticBatch, type StaticBatch, type StaticPiece } from "./staticBatch";

// Everything here is a Polytope nature model drawn in one instanced batch (sizes in metres); lights
// and labels only show state. Keys are glowing ore, the candles are rune stones, the altar is a
// stone circle, gates are wooden gates that sink into the ground, and vote plates are stepping stones.
export const OBJECTIVE_MODELS = ["pt_gate_wood", "pt_ore_rock", "pt_menhir", "pt_river_rocks", "pt_mushroom"];

const GATE_SINK = 2.6;
const GATE_SINK_RATE = 2.5;
const ORE_SCALE = 1.7;
const DEVICE_SCALE = 0.85;
const ALTAR_SCALE = 1.25;
const RING_SCALE = 0.45;
const RUNE_LIGHT = 0x7fd4ff;
const ORE_LIGHT = 0xffc86a;
const PLATE_DROP_HEIGHT = 7;
const PLATE_DROP_SECONDS = 0.45;
// Each dropped plate gets a light above it and mushrooms on its rim so it reads from across the field.
const PLATE_GLOW_HEIGHT = 2.4;
const PLATE_GLOW_RANGE = 5;
const PLATE_GLOW_IDLE = 0xffd9a0;
const PLATE_GLOW_SKIP = 0xcfd6e0;
const PLATE_GLOW_LEADING = 0xff9a3a;
const PLATE_MUSHROOMS = 3;
const PLATE_LABEL_HEIGHT = 2.1;
const LABEL_IDLE = "#f0d9a8";
const LABEL_SKIP = "#c9c1b3";
const LABEL_LEADING = "#ffb35a";
const LABEL_OFF = "#777777";
const SKIP_LABEL = "건너뛰기";

const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

// A movable group of batch pieces: each piece keeps its offset from the group's floor point.
interface Part { piece: number; local: THREE.Matrix4 }
interface GateView { parts: Part[]; at: Point2; yaw: number; sunk: number; shown: number }
interface KeyView { part: Part; at: Point2; y: number; taken: boolean; shown: boolean | null }
interface DeviceView { on: boolean }
interface PlateView {
  parts: Part[];
  glow: { position: THREE.Vector3; color: THREE.Color; power: number };
  label: THREE.Sprite;
  text: string;
  color: string;
}

export class ObjectiveProps {
  private readonly pieces: StaticPiece[] = [];
  private readonly batch: StaticBatch;
  private readonly gates = new Map<number, GateView>();
  private readonly keys: KeyView[] = [];
  private readonly devices: DeviceView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly boxes = new Map<string, THREE.Box3>();
  private readonly scratch = new THREE.Matrix4();
  private altarPower = 0;
  private flicker = 1;
  private readonly rune = new THREE.Color(RUNE_LIGHT);
  private readonly ore = new THREE.Color(ORE_LIGHT);
  private time = 0;
  private roundKey: number | null = null;
  private landed = false;
  private platesShown = true;
  private lastHeight = Number.NaN;
  // Called once when a round's plates hit the ground.
  onLand: (() => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly layout: LevelLayout,
    private readonly library: ModelLibrary,
    private readonly lights: LightPool,
  ) {
    for (const gate of layout.gates) this.addGate(gate);
    for (const at of layout.shards) this.addKeys(at);
    for (const at of layout.devices) this.addDevice(at);
    if (layout.altar) this.addAltar(layout.altar);
    for (let i = 0; i <= MATCH_PLAYERS; i++) this.addPlate();
    this.batch = buildStaticBatch(library, this.pieces);
    scene.add(this.batch.group);
    this.hidePlates();
  }

  // A model's local matrix that stands it on the floor, centred on its footprint.
  private grounded(model: string, scale: number, turn = new THREE.Matrix4()): { local: THREE.Matrix4; height: number } {
    const key = `${model}:${scale}:${turn.elements.join(",")}`;
    let box = this.boxes.get(key);
    if (!box) {
      const probe = new THREE.Group();
      const object = this.library.get(model).scene.clone();
      probe.add(object);
      object.matrixAutoUpdate = false;
      object.matrix.copy(turn).multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
      probe.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(probe);
      this.boxes.set(key, box);
    }
    const centre = box.getCenter(new THREE.Vector3());
    const local = new THREE.Matrix4()
      .makeTranslation(-centre.x, -box.min.y, -centre.z)
      .multiply(turn)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    return { local, height: box.max.y - box.min.y };
  }

  private placement(at: Point2, y: number, yaw: number): THREE.Matrix4 {
    return new THREE.Matrix4().makeRotationAxis(UP, yaw).setPosition(at.x, y, at.z);
  }

  // Adds a fixed piece and returns its height.
  private fixed(model: string, at: Point2, y = 0, yaw = 0, scale = 1): number {
    const { local, height } = this.grounded(model, scale);
    this.pieces.push({ model, matrix: this.placement(at, y, yaw).multiply(local) });
    return height;
  }

  // Adds a piece that moves later.
  private movable(model: string, local: THREE.Matrix4, at: Point2, y: number, yaw: number): Part {
    this.pieces.push({ model, matrix: this.placement(at, y, yaw).multiply(local) });
    return { piece: this.pieces.length - 1, local };
  }

  private moveParts(parts: Part[], at: Point2, y: number, yaw: number): void {
    const base = this.placement(at, y, yaw);
    for (const part of parts) this.batch.move(part.piece, this.scratch.multiplyMatrices(base, part.local));
  }

  // A wooden gate across the passage that sinks into the ground when it opens.
  private addGate(gate: { n: number; x: number; z: number }): void {
    const t = this.layout.tileSize;
    const col = Math.floor(gate.x / t);
    const row = Math.floor(gate.z / t);
    const alongX = !this.layout.solid[row]?.[col - 1] && !this.layout.solid[row]?.[col + 1];
    // The gate model spans x, so it is turned across a passage that runs along x.
    const yaw = alongX ? Math.PI / 2 : 0;
    const size = new THREE.Box3().setFromObject(this.library.get("pt_gate_wood").scene).getSize(new THREE.Vector3());
    const { local } = this.grounded("pt_gate_wood", t / size.x);
    const part = this.movable("pt_gate_wood", local, gate, 0, yaw);
    this.gates.set(gate.n, { parts: [part], at: gate, yaw, sunk: 0, shown: 0 });
  }

  // A lump of glowing ore: the key shard, found by its warm light.
  private addKeys(at: Point2): void {
    const { local, height } = this.grounded("pt_ore_rock", ORE_SCALE);
    const part = this.movable("pt_ore_rock", local, at, 0, 0);
    const view: KeyView = { part, at, y: 0, taken: false, shown: null };
    this.lights.add({
      position: new THREE.Vector3(at.x, height + 0.6, at.z), color: this.ore, range: 5,
      intensity: () => (view.taken ? 0 : 6 + Math.sin(this.time * 3) * 1.5),
    });
    this.keys.push(view);
  }

  // A standing rune stone; its runes glow while the device is on.
  private addDevice(at: Point2): void {
    const top = this.fixed("pt_menhir", at, 0, 0.4, DEVICE_SCALE);
    const view: DeviceView = { on: false };
    this.lights.add({
      position: new THREE.Vector3(at.x, top * 0.7, at.z), color: this.rune, range: 8,
      intensity: () => (view.on ? 16 * this.flicker : 0),
    });
    this.devices.push(view);
  }

  // The altar: a tall stone ringed by small stones that mark the guarded area.
  private addAltar(at: Point2): void {
    const top = this.fixed("pt_menhir", at, 0, 0, ALTAR_SCALE);
    // The same stones the rules block (obstacles.ts).
    for (const stone of altarRing(this.layout)) {
      this.fixed("pt_menhir", stone, 0, Math.atan2(stone.x - at.x, stone.z - at.z), RING_SCALE);
    }
    this.lights.add({
      position: new THREE.Vector3(at.x, top + 0.5, at.z), color: this.rune, range: 12,
      intensity: () => this.altarPower,
    });
  }

  // A ring of flat stepping stones with mushrooms on its rim that drops for a vote round.
  private addPlate(): void {
    const raw = this.library.get("pt_river_rocks").scene;
    const size = new THREE.Box3().setFromObject(raw).getSize(new THREE.Vector3());
    const origin = { x: 0, z: 0 };
    const stones = this.grounded("pt_river_rocks", (PLATE_RADIUS * 2) / Math.max(size.x, size.z)).local;
    const parts = [this.movable("pt_river_rocks", stones, origin, 0, 0)];
    for (let i = 0; i < PLATE_MUSHROOMS; i++) {
      const a = (i / PLATE_MUSHROOMS) * Math.PI * 2 + 0.4;
      const local = this.placement({ x: Math.cos(a) * PLATE_RADIUS * 0.9, z: Math.sin(a) * PLATE_RADIUS * 0.9 }, 0.02, a)
        .multiply(this.grounded("pt_mushroom", 2).local);
      parts.push(this.movable("pt_mushroom", local, origin, 0, 0));
    }
    const label = createLabel();
    label.visible = false;
    this.scene.add(label);
    const glow = { position: new THREE.Vector3(), color: new THREE.Color(PLATE_GLOW_IDLE), power: 0 };
    this.lights.add({ position: glow.position, color: glow.color, range: PLATE_GLOW_RANGE, intensity: () => glow.power });
    this.plates.push({ parts, glow, label, text: "", color: "" });
  }

  private hidePlates(): void {
    if (!this.platesShown) return;
    this.platesShown = false;
    this.lastHeight = Number.NaN;
    for (const plate of this.plates) {
      for (const part of plate.parts) this.batch.move(part.piece, HIDDEN);
      plate.label.visible = false;
      // Forces the label to be redrawn (and shown) in the next round.
      plate.text = "";
      plate.glow.power = 0;
    }
  }

  // names[i] is the display name for match.players[i].
  update(match: PublicMatch, now: number, dt: number, names: string[]): void {
    this.time += dt;
    const o = match.objectives;
    for (const [n, gate] of this.gates) {
      const target = o.gates.includes(n) ? GATE_SINK : 0;
      gate.sunk = target === 0 ? 0 : Math.min(target, gate.sunk + dt * GATE_SINK_RATE);
      if (gate.sunk !== gate.shown) {
        gate.shown = gate.sunk;
        this.moveParts(gate.parts, gate.at, -gate.sunk, gate.yaw);
      }
    }
    this.keys.forEach((k, i) => {
      k.taken = o.shards[i];
      if (k.shown === !k.taken) return;
      k.shown = !k.taken;
      if (k.taken) this.batch.move(k.part.piece, HIDDEN);
      else this.moveParts([k.part], k.at, k.y, 0);
    });
    this.flicker = 1 + Math.sin(this.time * 11) * 0.08 + Math.sin(this.time * 23) * 0.05;
    this.devices.forEach((device, i) => {
      device.on = o.gates.includes(2) || (o.stage === "devices" && o.devices[i] > now);
    });
    const sealing = o.stage === "seal" && o.seal.lastAt !== null;
    this.altarPower = o.gates.includes(3) ? 20 * this.flicker
      : sealing ? (4 + (o.seal.progressMs / SEAL_DURATION_MS) * 16) * this.flicker : 0;
    this.updatePlates(match, now, names);
  }

  private updatePlates(match: PublicMatch, now: number, names: string[]): void {
    const round = match.vote.round;
    if (!round) {
      this.roundKey = null;
      this.hidePlates();
      return;
    }
    if (this.roundKey !== round.startedAt) {
      this.roundKey = round.startedAt;
      this.landed = false;
      this.lastHeight = Number.NaN;
    }
    // Grates fall from above and land together; everyone sees the same moment from server time.
    const t = Math.min(1, Math.max(0, (now - round.startedAt) / 1000 / PLATE_DROP_SECONDS));
    const height = PLATE_DROP_HEIGHT * (1 - t * t);
    if (t >= 1 && !this.landed) {
      this.landed = true;
      // A late joiner should not hear an old landing.
      if (now - round.startedAt < 1500) this.onLand?.();
    }
    const moving = height !== this.lastHeight;
    this.lastHeight = height;
    this.platesShown = true;
    this.plates.forEach((view, i) => {
      const at = round.plates[i];
      if (!at) {
        if (moving) for (const part of view.parts) this.batch.move(part.piece, HIDDEN);
        view.label.visible = false;
        view.glow.power = 0;
        return;
      }
      if (moving) {
        this.moveParts(view.parts, at, height, 0);
        view.label.position.set(at.x, height + PLATE_LABEL_HEIGHT, at.z);
      }
      const skip = i === match.players.length;
      const accused = skip ? null : match.players[i];
      const text = skip ? SKIP_LABEL : (names[i] ?? "");
      const off = !!accused && !isActive(match, accused);
      const leading = round.leading === i;
      const color = off ? LABEL_OFF : leading ? LABEL_LEADING : skip ? LABEL_SKIP : LABEL_IDLE;
      view.glow.position.set(at.x, PLATE_GLOW_HEIGHT, at.z);
      view.glow.color.setHex(leading ? PLATE_GLOW_LEADING : skip ? PLATE_GLOW_SKIP : PLATE_GLOW_IDLE);
      view.glow.power = t < 1 || off ? 0 : leading ? 22 + Math.sin(this.time * 10) * 6 : 14;
      if (text !== view.text || color !== view.color) {
        view.text = text;
        view.color = color;
        setLabel(view.label, text, color);
      }
    });
  }
}
