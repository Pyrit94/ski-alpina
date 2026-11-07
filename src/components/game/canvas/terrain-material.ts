import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Micro-detail for the ground.
 *
 * The mountain's colour comes from vertex colours on a DEM mesh, which gives
 * it large-scale truth and no small-scale variation whatsoever: a snowfield
 * covers a third of the screen in one even tone, and the eye reads it as a
 * flat plate no matter how good the lighting is.
 *
 * The detail is procedural 3D noise rather than a tiled texture, which is a
 * deliberate trade. A texture mapped by world XZ stretches into smears on
 * anything steep — exactly where an alpine map spends its budget — and the
 * usual cure, triplanar mapping, means sampling every map three times and
 * blending by the normal. Noise evaluated on the world position has no UVs to
 * stretch in the first place, costs no downloads, and cannot be seen to tile.
 *
 * What it buys: a break-up in albedo so large fields stop reading as one
 * surface, and a perturbation of the normal so the sun catches roughness that
 * the 30 m DEM cannot carry.
 */

/** Cheap hash-based value noise. Enough for surface break-up, not for beauty. */
const NOISE_GLSL = /* glsl */ `
float skiHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float skiNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(skiHash(i + vec3(0.0, 0.0, 0.0)), skiHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(skiHash(i + vec3(0.0, 1.0, 0.0)), skiHash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y),
    mix(
      mix(skiHash(i + vec3(0.0, 0.0, 1.0)), skiHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(skiHash(i + vec3(0.0, 1.0, 1.0)), skiHash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y),
    f.z);
}

float skiFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < SKI_OCTAVES; i++) {
    sum += amp * skiNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`;

export type TerrainDetail = {
  /** Noise octaves. More is finer grain and linearly more expensive. */
  octaves: number;
  /** World-space frequency of the coarsest octave. */
  scale: number;
  /** How much the noise lightens and darkens the ground colour. */
  albedo: number;
  /**
   * How hard the noise bends the surface normal. Zero skips the two extra
   * noise samples the gradient needs — the mobile setting, because the ground
   * is a full-screen surface and this is a per-fragment cost.
   */
  bump: number;
  /**
   * How strongly bare rock breaks through on steep faces, evaluated per
   * fragment from the surface normal. The vertex colours already carry rock
   * by slope, but at 1.2 units a vertex that boundary is a soft smear; this
   * puts a ragged, noise-broken edge on it — the crags and ribs that make a
   * face read as a mountain. Zero drops it (the data overlays).
   */
  rock: number;
};

/**
 * Frequencies are set against how far the camera actually sits: the map is 196
 * units across and play distance runs 16 to 250, so at a typical 60 a feature
 * has to be a couple of units wide to read at all. A first attempt at 0.62 —
 * a 1.6-unit period — was invisible at that distance and only added aliasing.
 * 0.14 puts the coarsest octave at roughly 7 units, the size of a wind drift
 * or a scoured patch, with the finer octaves carrying the grain.
 */
export const TERRAIN_DETAIL: Record<"low" | "high", TerrainDetail> = {
  // Albedo break-up only. The ground covers most of the screen, so the two
  // extra samples a normal gradient costs are the difference between a phone
  // holding its frame rate and not.
  low: { octaves: 2, scale: 0.13, albedo: 0.14, bump: 0, rock: 0.85 },
  high: { octaves: 3, scale: 0.14, albedo: 0.17, bump: 0.85, rock: 1 },
};

/**
 * The height and heat overlays are read as data, so they get no detail at all:
 * noise on a legend is just noise.
 */
export const OVERLAY_DETAIL: TerrainDetail = { octaves: 1, scale: 0.14, albedo: 0, bump: 0, rock: 0 };

/**
 * A standard material with the detail shader patched in.
 *
 * Built on `meshStandardMaterial` rather than a raw shader so the ground keeps
 * three's lighting, fog and — the one that matters here — shadow receiving.
 */
export function makeTerrainMaterial(detail: TerrainDetail): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // Snow is not matte: a touch of sheen on the sunward slopes is what
    // separates it from white plaster.
    roughness: 0.8,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailScale = { value: detail.scale };
    shader.uniforms.uDetailAlbedo = { value: detail.albedo };
    shader.uniforms.uDetailBump = { value: detail.bump };

    shader.uniforms.uRock = { value: detail.rock };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float skiAO;
varying vec3 vSkiWorld;
varying vec3 vSkiUp;
varying float vSkiAO;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vSkiWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vSkiUp = normalize(mat3(modelMatrix) * objectNormal);
vSkiAO = skiAO;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
#define SKI_OCTAVES ${Math.max(1, Math.round(detail.octaves))}
#define SKI_ROCK ${detail.rock > 0 ? 1 : 0}
varying vec3 vSkiWorld;
varying vec3 vSkiUp;
varying float vSkiAO;
uniform float uRock;
uniform float uDetailScale;
uniform float uDetailAlbedo;
uniform float uDetailBump;
${NOISE_GLSL}`,
      )
      // After the albedo is assembled, so this modulates the vertex colour
      // rather than being overwritten by it.
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  float skiN = skiFbm(vSkiWorld * uDetailScale);
  diffuseColor.rgb *= 1.0 + (skiN - 0.5) * uDetailAlbedo;
#if SKI_ROCK
  // Steepness from the interpolated normal. The DEM's vertical scale is about
  // twice its horizontal, so 0.5 here is roughly a 41 degree real slope —
  // where snow stops holding. The noise shifts the threshold so the edge is
  // ragged crag rather than a contour line.
  float skiSteep = 1.0 - clamp(normalize(vSkiUp).y, 0.0, 1.0);
  float skiJag = (skiN - 0.5) * 0.32;
  float skiRock = smoothstep(0.5 + skiJag, 0.58 + skiJag, skiSteep) * uRock;
  // Warm grey-brown gneiss, banded by the same noise so it is not one flat tone.
  vec3 skiStone = mix(vec3(0.12, 0.10, 0.085), vec3(0.27, 0.235, 0.2), skiN);
  diffuseColor.rgb = mix(diffuseColor.rgb, skiStone, skiRock);
#endif
  // A little of the occlusion in the albedo itself, so a gully reads even
  // where the sky light is weak; the rest goes on the sky light below.
  diffuseColor.rgb *= mix(1.0, vSkiAO, 0.3);
}`,
      )
      // Occlusion belongs on the light that comes from the whole sky, not on
      // the sun: a couloir in full sun is bright, the same couloir in shade is
      // darker and bluer than the open slope beside it.
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vSkiAO;
reflectedLight.indirectSpecular *= vSkiAO;`,
      );

    if (detail.bump > 0) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  // Central-ish difference of the noise field. Two extra samples, not six:
  // the y gradient does not read on ground seen from above.
  float e = 1.0 / max(uDetailScale, 0.0001) * 0.25;
  vec3 p = vSkiWorld * uDetailScale;
  float n0 = skiNoise(p);
  float nx = skiNoise((vSkiWorld + vec3(e, 0.0, 0.0)) * uDetailScale) - n0;
  float nz = skiNoise((vSkiWorld + vec3(0.0, 0.0, e)) * uDetailScale) - n0;
  normal = normalize(normal + vec3(-nx, 0.0, -nz) * uDetailBump);
}`,
      );
    }
  };

  // Two materials whose programs differ only inside onBeforeCompile still hash
  // to the same program without this, so the second one silently renders with
  // the first one's shader.
  material.customProgramCacheKey = () =>
    `ski-terrain-${detail.octaves}-${detail.bump > 0 ? "bump" : "flat"}-${detail.rock > 0 ? "rock" : "bare"}`;

  return material;
}

/** `makeTerrainMaterial` as a hook, disposed with the component. */
export function useTerrainMaterial(quality: "low" | "high" | "overlay") {
  const material = useMemo(
    () => makeTerrainMaterial(quality === "overlay" ? OVERLAY_DETAIL : TERRAIN_DETAIL[quality]),
    [quality],
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
