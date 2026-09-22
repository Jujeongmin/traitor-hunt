import type { MoveInput } from "../rules/movement";

// Keys typed into a text box (the chat) are words, not moves.
export function typing(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
}

export class FpsInput {
  // Left button held: swing. Right button held: raise the shield.
  firing = false;
  blocking = false;
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  // On-screen controls (touch): a joystick's push, look drags, and held buttons.
  private virtualMove: MoveInput = { forward: 0, strafe: 0 };
  private virtualFiring = false;
  private virtualBlocking = false;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener("click", this.onClick);
    element.addEventListener("mousedown", this.onMouseDown);
    element.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("mousemove", this.onMouseMove);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  // Captures the mouse for looking about (hiding the cursor); the browser allows it just after a
  // click or a key, and says no quietly otherwise.
  lock(): void {
    if (!this.locked) this.element.requestPointerLock()?.catch(() => {});
  }

  moveInput(): MoveInput {
    const k = (code: string) => (this.keys.has(code) ? 1 : 0);
    const forward = k("KeyW") - k("KeyS") + this.virtualMove.forward;
    const strafe = k("KeyD") - k("KeyA") + this.virtualMove.strafe;
    return { forward: Math.max(-1, Math.min(1, forward)), strafe: Math.max(-1, Math.min(1, strafe)) };
  }

  // The on-screen controls: the joystick's push (each -1 to 1), a look drag in pixels, a held
  // attack or guard button, and a tapped key.
  setVirtualMove(forward: number, strafe: number): void {
    this.virtualMove = { forward, strafe };
  }

  addVirtualLook(dx: number, dy: number): void {
    this.lookX += dx;
    this.lookY += dy;
  }

  // A tap on the attack button, too short to be held over a frame, still lands one blow.
  setVirtualFiring(on: boolean): void {
    this.virtualFiring = on;
    this.firing = on || this.mouseFiring;
    if (on) this.pressed.add("VirtualFire");
  }

  setVirtualBlocking(on: boolean): void {
    this.virtualBlocking = on;
    this.blocking = on || this.mouseBlocking;
  }

  press(code: string): void {
    this.pressed.add(code);
  }

  private mouseFiring = false;
  private mouseBlocking = false;

  consumeLook(): { dx: number; dy: number } {
    const look = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumePress(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  dispose(): void {
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("mousedown", this.onMouseDown);
    this.element.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("mousemove", this.onMouseMove);
    if (this.locked) document.exitPointerLock();
  }

  private onClick = () => {
    // Browsers refuse the lock in some embeds (e.g. an iframe without allow="pointer-lock").
    if (!this.locked) this.element.requestPointerLock()?.catch(() => {});
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && this.locked) this.mouseFiring = true;
    if (e.button === 2 && this.locked) this.mouseBlocking = true;
    this.firing = this.mouseFiring || this.virtualFiring;
    this.blocking = this.mouseBlocking || this.virtualBlocking;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseFiring = false;
    if (e.button === 2) this.mouseBlocking = false;
    this.firing = this.mouseFiring || this.virtualFiring;
    this.blocking = this.mouseBlocking || this.virtualBlocking;
  };
  // The right button raises the shield, so it must not open the browser's menu.
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (typing(e)) return;
    this.keys.add(e.code);
    if (!e.repeat) this.pressed.add(e.code);
  };
  // Let go even while typing, so a key held when the chat opened does not stay down.
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.pressed.clear();
    this.mouseFiring = false;
    this.mouseBlocking = false;
    this.firing = this.virtualFiring;
    this.blocking = this.virtualBlocking;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.lookX += e.movementX;
    this.lookY += e.movementY;
  };
}
