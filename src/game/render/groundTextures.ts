import * as THREE from "three";
import { publicUrl } from "../assets/publicUrl";

// The grain of the ground: photos of real grass, forest floor and a path (CC0, Poly Haven and
// ambientCG), tiled over the ground plane. The ground's own colours stay as they are; each picture
// only adds its light and dark (the picture over its average colour), so the meadow keeps its patches.

interface Layer {
  file: string;
  // Metres the picture spans on the ground.
  size: number;
  // The picture's average colour, linear (measured when the picture was chosen).
  mean: [number, number, number];
}

// Grass, forest floor under the trees, and path: file, metres the picture spans, and its average
// colour (linear, measured when the pictures were chosen).
const LAYERS: Layer[] = [
  { file: "aerial_grass_rock.jpg", size: 3, mean: [0.1701, 0.1223, 0.0275] },
  { file: "forest_floor.jpg", size: 4, mean: [0.0975, 0.0527, 0.0355] },
  { file: "grass_path.jpg", size: 3, mean: [0.2826, 0.2309, 0.1356] },
];
// How strongly the grain shows: 0 plain colour, 1 the picture's full light and dark.
const STRENGTH = 0.9;

let textures: THREE.Texture[] | null = null;

function loadTextures(): THREE.Texture[] {
  const loader = new THREE.TextureLoader();
  return LAYERS.map((layer) => {
    const texture = loader.load(publicUrl(`assets/ground/${layer.file}`));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  });
}

export function groundMaterial(): THREE.MeshStandardMaterial {
  textures ??= loadTextures();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const [grass, forest, path] = textures;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      groundGrass: { value: grass },
      groundForest: { value: forest },
      groundPath: { value: path },
      groundMeans: { value: LAYERS.map((l) => new THREE.Vector3(...l.mean)) },
      groundSizes: { value: new THREE.Vector3(...LAYERS.map((l) => l.size)) },
      groundStrength: { value: STRENGTH },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSplat = splat;\nvGround = (modelMatrix * vec4(position, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D groundGrass;
uniform sampler2D groundForest;
uniform sampler2D groundPath;
uniform vec3 groundMeans[3];
uniform vec3 groundSizes;
uniform float groundStrength;
varying vec3 vSplat;
varying vec2 vGround;
// One picture at two sizes, the second turned, so its repeats do not line up into a grid.
vec3 groundLayer(sampler2D map, float size, vec3 mean) {
  vec2 p = vGround / size;
  vec3 near = texture2D(map, p).rgb;
  vec3 far = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.37 + 0.5).rgb;
  return mix(near, far, 0.4) / mean;
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
vec3 grain = groundLayer(groundGrass, groundSizes.x, groundMeans[0]) * vSplat.x
  + groundLayer(groundForest, groundSizes.y, groundMeans[1]) * vSplat.y
  + groundLayer(groundPath, groundSizes.z, groundMeans[2]) * vSplat.z;
diffuseColor.rgb *= mix(vec3(1.0), grain, groundStrength);`);
  };
  return material;
}
