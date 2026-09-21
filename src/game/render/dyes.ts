import * as THREE from "three";
import { optionOf, type Costume, type Dye } from "./costumes";

// The hero's texture is a palette of flat colour squares, so a part can be repainted in the shader:
// every mesh gets its own copy of the material with the repaints its costume asks for.

type Rgb = readonly [number, number, number];

// The pack's skin, lit and shaded; pixels near these are skin, whatever mesh they are on.
const SKIN: Rgb = [228, 168, 99];
const SKIN_SHADE: Rgb = [182, 124, 52];
// Each hair mesh's own main colour: a painted colour keeps the hair's shading relative to it.
const HAIR_BASE: Record<string, Rgb> = { Hair01: [225, 136, 19], Hair06: [239, 45, 226] };

// Which colour parts reach which meshes.
const HAIR = new Set(Object.keys(HAIR_BASE));
const HEADS = new Set(["Head01_Male", "Head02_Female"]);
const BODIES = new Set(["Body05", "Body10"]);
const CLOAKS = new Set(["Cloak02", "Cloak03"]);

export interface MeshDye {
  // Whole-part colour and the colour it replaces (sRGB 0-255).
  paint: { rgb: Rgb; base: Rgb } | null;
  skin: Rgb | null;
  hue: { degrees: number; saturation: number } | null;
}

function dyeOf(costume: Costume, key: "hairColor" | "skin" | "clothColor" | "cloakColor"): Dye | null {
  return optionOf(costume, key)?.dye ?? null;
}

// What one mesh of this costume is repainted with; null leaves it in the pack's colours.
export function meshDye(costume: Costume, mesh: string): MeshDye | null {
  const out: MeshDye = { paint: null, skin: null, hue: null };
  const hair = dyeOf(costume, "hairColor");
  if (HAIR.has(mesh) && hair?.kind === "paint") out.paint = { rgb: hair.rgb, base: HAIR_BASE[mesh] };
  const skin = dyeOf(costume, "skin");
  if ((HEADS.has(mesh) || BODIES.has(mesh)) && skin?.kind === "skin") out.skin = skin.rgb;
  const cloth = dyeOf(costume, BODIES.has(mesh) ? "clothColor" : "cloakColor");
  if ((BODIES.has(mesh) || CLOAKS.has(mesh)) && cloth?.kind === "hue") {
    out.hue = { degrees: cloth.degrees, saturation: cloth.saturation };
  }
  return out.paint || out.skin || out.hue ? out : null;
}

const linear = (rgb: Rgb) => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const srgbVec = (rgb: Rgb) => new THREE.Vector3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

const DYE_GLSL = /* glsl */ `
#ifdef USE_DYE
{
  vec3 lin = diffuseColor.rgb;
  vec3 srgb = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  bool isSkin = distance(srgb, dyeSkinKey) < 0.1 || distance(srgb, dyeSkinShadeKey) < 0.1;
  if (isSkin) {
    if (dyeSkinOn > 0.5) lin = dyeSkin * lum / dyeSkinBase;
  } else {
    if (dyePaintOn > 0.5) lin = dyePaint * lum / dyePaintBase;
    if (dyeHueOn > 0.5) {
      vec3 s = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(s.bg, K.wz), vec4(s.gb, K.xy), step(s.b, s.g));
      vec4 q = mix(vec4(p.xyw, s.r), vec4(s.r, p.yzx), step(p.x, s.r));
      float d = q.x - min(q.w, q.y);
      vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
      hsv.x = fract(hsv.x + dyeHue);
      hsv.y *= dyeSaturation;
      vec3 r = clamp(abs(fract(hsv.x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
      lin = pow(hsv.z * mix(vec3(1.0), r, hsv.y), vec3(2.2));
    }
  }
  diffuseColor.rgb = lin;
}
#endif
`;

const UNIFORMS = /* glsl */ `
#ifdef USE_DYE
uniform vec3 dyeSkinKey; uniform vec3 dyeSkinShadeKey;
uniform float dyeSkinOn; uniform vec3 dyeSkin; uniform float dyeSkinBase;
uniform float dyePaintOn; uniform vec3 dyePaint; uniform float dyePaintBase;
uniform float dyeHueOn; uniform float dyeHue; uniform float dyeSaturation;
#endif
`;

function dyedMaterial(source: THREE.Material, dye: MeshDye): THREE.Material {
  const material = source.clone();
  const skinBase = luminance(linear(SKIN));
  const uniforms = {
    dyeSkinKey: { value: srgbVec(SKIN) },
    dyeSkinShadeKey: { value: srgbVec(SKIN_SHADE) },
    dyeSkinOn: { value: dye.skin ? 1 : 0 },
    dyeSkin: { value: dye.skin ? linear(dye.skin) : new THREE.Color() },
    dyeSkinBase: { value: skinBase },
    dyePaintOn: { value: dye.paint ? 1 : 0 },
    dyePaint: { value: dye.paint ? linear(dye.paint.rgb) : new THREE.Color() },
    dyePaintBase: { value: dye.paint ? luminance(linear(dye.paint.base)) : 1 },
    dyeHueOn: { value: dye.hue ? 1 : 0 },
    dyeHue: { value: (dye.hue?.degrees ?? 0) / 360 },
    dyeSaturation: { value: dye.hue?.saturation ?? 1 },
  };
  material.defines = { ...material.defines, USE_DYE: "" };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${UNIFORMS}`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${DYE_GLSL}`);
  };
  // Every dyed material shares one program; the colours live in its uniforms.
  material.customProgramCacheKey = () => "hero-dye";
  return material;
}

// Repaints a hero instance for its costume. Call once per instance, before it is drawn.
// The part's name may sit on the mesh or on a group above it, depending on how the node was exported.
export function applyDyes(object: THREE.Object3D, costume: Costume): void {
  const dyed = new Set<THREE.Object3D>();
  object.traverse((part) => {
    const dye = meshDye(costume, part.name);
    if (!dye) return;
    part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || dyed.has(mesh)) return;
      dyed.add(mesh);
      mesh.material = dyedMaterial(mesh.material, dye);
    });
  });
}
