import * as THREE from "three";

// A painted sky for the background: deep blue overhead fading to a pale horizon, a warm sun where
// the scene's sunlight comes from, and soft clouds. Drawn once on a canvas (no files to load) and
// wrapped round the world as an equirectangular background.

// The pale blue the sky reaches at the horizon; the fog fades distant trees into it.
export const HORIZON = 0xcfe4ee;

const WIDTH = 2048;
const HEIGHT = 1024;

// A stable pseudo-random sequence, so every player sees the same clouds.
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Where a direction lands on the canvas, the way three.js reads an equirectangular background.
function toCanvas(dir: THREE.Vector3): { x: number; y: number } {
  const d = dir.clone().normalize();
  const u = Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5;
  const v = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) / Math.PI + 0.5;
  return { x: u * WIDTH, y: (1 - v) * HEIGHT };
}

function paint(ctx: CanvasRenderingContext2D, sunDir: THREE.Vector3): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#3f86d6");
  sky.addColorStop(0.28, "#6aa9e6");
  sky.addColorStop(0.44, "#a9d0ef");
  sky.addColorStop(0.5, "#cfe4ee");
  sky.addColorStop(0.53, "#c6dcc9");
  sky.addColorStop(1, "#8fa878");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // The sun: a bright core in a wide warm glow.
  const sun = toCanvas(sunDir);
  for (const dx of [-WIDTH, 0, WIDTH]) {
    const glow = ctx.createRadialGradient(sun.x + dx, sun.y, 0, sun.x + dx, sun.y, 260);
    glow.addColorStop(0, "rgba(255, 250, 225, 1)");
    glow.addColorStop(0.08, "rgba(255, 244, 200, 0.95)");
    glow.addColorStop(0.25, "rgba(255, 226, 160, 0.35)");
    glow.addColorStop(1, "rgba(255, 220, 150, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x + dx - 260, sun.y - 260, 520, 520);
  }

  // Clouds: clusters of soft puffs, flattened, thinner and smaller toward the horizon.
  const rand = random(7);
  for (let i = 0; i < 46; i++) {
    const cx = rand() * WIDTH;
    const height = 0.2 + rand() * 0.26;
    const cy = HEIGHT * height;
    const nearHorizon = (height - 0.2) / 0.26;
    const size = 70 + rand() * 90 * (1 - nearHorizon * 0.5);
    const puffs = 6 + Math.floor(rand() * 8);
    for (let p = 0; p < puffs; p++) {
      const px = cx + (rand() - 0.5) * size * 2.4;
      const py = cy + (rand() - 0.5) * size * 0.45;
      const r = size * (0.45 + rand() * 0.55);
      for (const dx of [-WIDTH, 0, WIDTH]) {
        ctx.save();
        ctx.translate(px + dx, py);
        ctx.scale(1, 0.55);
        const puff = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        const a = 0.55 + rand() * 0.25;
        puff.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        puff.addColorStop(0.6, `rgba(250, 252, 255, ${a * 0.55})`);
        puff.addColorStop(1, "rgba(245, 250, 255, 0)");
        ctx.fillStyle = puff;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

let cached: { key: string; texture: THREE.Texture } | null = null;

// The sky with its sun toward sunDir (the direction the sunlight comes from). Null where there is
// no canvas to paint on (tests).
export function skyTexture(sunDir: THREE.Vector3): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const key = sunDir.toArray().map((n) => n.toFixed(3)).join(",");
  if (cached?.key === key) return cached.texture;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paint(ctx, sunDir);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cached = { key, texture };
  return texture;
}
