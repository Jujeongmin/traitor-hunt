import * as THREE from "three";
import { publicUrl } from "../assets/publicUrl";

// Pictures for effects (CC0, OpenGameArt): a runed magic circle (teleport circle sprite sheet, made
// white so any colour can tint it) laid flat on the ground, and a white spell shot (Pure Projectile).

const loaded = new Map<string, THREE.Texture>();

function picture(file: string): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  let texture = loaded.get(file);
  if (!texture) {
    texture = new THREE.TextureLoader().load(publicUrl(`assets/fx/${file}`));
    texture.colorSpace = THREE.SRGBColorSpace;
    loaded.set(file, texture);
  }
  return texture;
}

// One unit across, lying flat, facing up.
const flat = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

// A magic circle of radius 1 (scale it to size) in colour, glowing over the ground.
export function magicCircle(color: number, opacity: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({
    map: picture("magic_circle.png"), color, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(flat, material);
}

// The spell shot's picture: pointing along +x.
export function boltPicture(): THREE.Texture | null {
  return picture("bolt.png");
}
