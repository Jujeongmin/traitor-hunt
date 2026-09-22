import * as THREE from "three";

// Floating text labels (names over players, NPCs and portals). Screen-facing UI, not world props.
// A label keeps the height it was made with; its width grows with the text, so a long name is never
// cut off.

const CANVAS_HEIGHT = 64;
const MIN_CANVAS_WIDTH = 256;
const FONT = "600 30px system-ui, sans-serif";
// Room left either side of the text, in canvas pixels.
const PADDING = 16;

export function createLabel(width = 2.4): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.scale.set(width, width / 4, 1);
  sprite.userData.labelHeight = width / 4;
  sprite.visible = false;
  return sprite;
}

export function setLabel(sprite: THREE.Sprite, text: string, color = "#f0d9a8"): void {
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  let width = MIN_CANVAS_WIDTH;
  if (measure) {
    measure.font = FONT;
    width = Math.max(MIN_CANVAS_WIDTH, Math.ceil(measure.measureText(text).width) + PADDING * 2);
  }
  canvas.width = width;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // A dark rim instead of a plate behind the text, so less of the scene is covered.
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.strokeText(text, width / 2, CANVAS_HEIGHT / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, CANVAS_HEIGHT / 2);
  }
  const material = sprite.material;
  material.map?.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
  // Same height as before, as wide as the text needs.
  const height = (sprite.userData.labelHeight as number | undefined) ?? sprite.scale.y;
  sprite.scale.set(height * (width / CANVAS_HEIGHT), height, 1);
  sprite.visible = text.length > 0;
}
