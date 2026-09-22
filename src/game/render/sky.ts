import * as THREE from "three";
import { publicUrl } from "../assets/publicUrl";

// The sky: a photo of a real sky (Kloppenheim 06, Poly Haven, CC0; tone-mapped and shrunk to
// 2048 x 1024), wrapped round the world as an equirectangular background.

// The colour the sky reaches at the horizon (measured from the photo); the fog fades distant trees
// into it.
export const HORIZON = 0xa5a4a1;

let cached: THREE.Texture | null = null;

// The sky picture, loading in the background. Null where there is no document (tests).
export function skyTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  if (cached) return cached;
  const texture = new THREE.TextureLoader().load(publicUrl("assets/sky/kloppenheim_06.jpg"));
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  cached = texture;
  return texture;
}
