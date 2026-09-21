import * as THREE from "three";
import { optionOf, type Costume } from "./costumes";
import { isWeaponMesh, type HeroRig } from "./heroes";

// Costume colours, painted in the shader: every mesh gets its own copy of the material. The heroes'
// textures are hand painted, so skin is found by its colour (a warm, soft, light tone) rather than
// by where it sits on the texture.

type Rgb = readonly [number, number, number];

// A typical lit skin pixel in the pack; a painted skin keeps each pixel's shading relative to it.
const SKIN_BASE: Rgb = [236, 190, 152];

export interface MeshDye {
  skin: Rgb | null;
  hue: { degrees: number; saturation: number } | null;
}

// What one mesh of this costume is repainted with; null leaves it in the pack's colours.
export function meshDye(costume: Costume, mesh: string): MeshDye | null {
  const out: MeshDye = { skin: null, hue: null };
  const weapon = isWeaponMesh(mesh);
  const colour = optionOf(costume, weapon ? "weaponColor" : "clothColor")?.dye;
  if (colour?.kind === "hue") out.hue = { degrees: colour.degrees, saturation: colour.saturation };
  const skin = optionOf(costume, "skin")?.dye;
  if (!weapon && skin?.kind === "skin") out.skin = skin.rgb;
  return out.skin || out.hue ? out : null;
}

const linear = (rgb: Rgb) => new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
const luminance = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

const DYE_GLSL = /* glsl */ `
#ifdef USE_DYE
{
  vec3 lin = diffuseColor.rgb;
  vec3 s = pow(max(lin, vec3(0.0)), vec3(1.0 / 2.2));
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(s.bg, K.wz), vec4(s.gb, K.xy), step(s.b, s.g));
  vec4 q = mix(vec4(p.xyw, s.r), vec4(s.r, p.yzx), step(p.x, s.r));
  float d = q.x - min(q.w, q.y);
  vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
  // Skin: orange-ish, not too grey, not too vivid, and light.
  bool isSkin = hsv.x > 0.02 && hsv.x < 0.11 && hsv.y > 0.18 && hsv.y < 0.55 && hsv.z > 0.55;
  if (isSkin) {
    if (dyeSkinOn > 0.5) lin = dyeSkin * dot(lin, vec3(0.2126, 0.7152, 0.0722)) / dyeSkinBase;
  } else if (dyeHueOn > 0.5) {
    hsv.x = fract(hsv.x + dyeHue);
    hsv.y *= dyeSaturation;
    vec3 r = clamp(abs(fract(hsv.x + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    lin = pow(hsv.z * mix(vec3(1.0), r, hsv.y), vec3(2.2));
  }
  diffuseColor.rgb = lin;
}
#endif
`;

const UNIFORMS = /* glsl */ `
#ifdef USE_DYE
uniform float dyeSkinOn; uniform vec3 dyeSkin; uniform float dyeSkinBase;
uniform float dyeHueOn; uniform float dyeHue; uniform float dyeSaturation;
#endif
`;

function dyedMaterial(source: THREE.Material, dye: MeshDye): THREE.Material {
  const material = source.clone();
  const uniforms = {
    dyeSkinOn: { value: dye.skin ? 1 : 0 },
    dyeSkin: { value: dye.skin ? linear(dye.skin) : new THREE.Color() },
    dyeSkinBase: { value: luminance(linear(SKIN_BASE)) },
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

// Dresses a hero instance in its costume: takes off the accessories if asked, and repaints.
// Call once per instance, before it is drawn.
export function applyCostume(object: THREE.Object3D, costume: Costume, rig: HeroRig): void {
  const wearGear = optionOf(costume, "gear")?.gear !== false;
  const gear = new Set(rig.gear);
  object.traverse((part) => {
    if (gear.has(part.name)) part.visible = wearGear;
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    // The name may sit on the mesh or on the node above it.
    const dye = meshDye(costume, mesh.name || mesh.parent?.name || "");
    if (dye) mesh.material = dyedMaterial(mesh.material, dye);
  });
}
