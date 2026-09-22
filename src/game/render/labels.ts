import * as THREE from "three";

// Floating text labels (names over plates and players). Screen-facing UI, not world props.
export function createLabel(width = 2.4): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.scale.set(width, width / 4, 1);
  sprite.visible = false;
  return sprite;
}

export function setLabel(sprite: THREE.Sprite, text: string, color = "#f0d9a8"): void {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // A dark rim instead of a plate behind the text, so less of the scene is covered.
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.strokeText(text, 128, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);
  }
  const material = sprite.material;
  material.map?.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.needsUpdate = true;
  sprite.visible = text.length > 0;
}
