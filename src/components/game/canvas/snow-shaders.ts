// Explicit extension so the node test runner can load this directly.
import * as THREE from "three";

/**
 * The season, as the shaders see it: one set of uniforms shared by every
 * material that cares (trees, roofs), so a change of season is a few number
 * writes — no material rebuilt, no program recompiled, no draw call added.
 * `SeasonDriver` in SkiScene keeps them current.
 */
export const SEASON_UNIFORMS = {
  /** The eye's snow line, world units (see season-look.ts). */
  uSnowLineY: { value: -100 },
  /**
   * The simulation's snow line, snowmaking included, world units: the runs
   * stay white above it however green the slope beside them.
   */
  uRunLineY: { value: -100 },
  /** 0..1 larches turning gold. */
  uAutumn: { value: 0 },
  /** 0..1 larches standing bare (winter, late autumn). */
  uBare: { value: 0 },
};

/** Blend either side of the snow line for trees and roofs, world units. */
const FEATHER_GLSL = "smoothstep(uSnowLineY - 0.4, uSnowLineY + 2.5, $Y)";

/** World position of a vertex, instanced or not, as `seasonWorld`. */
const WORLD_POS_GLSL = `
  #ifdef USE_INSTANCING
    vec4 seasonWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    vec4 seasonWorld = modelMatrix * vec4(transformed, 1.0);
  #endif`;

/**
 * Snow lying on the conifers, in the shader: the geometry's `treeSnow`
 * attribute says where branches carry snow, and the tree's own height against
 * the season's snow line says whether there is any. One instanced mesh keeps
 * its single draw call.
 *
 * `larch` makes the stand deciduous: gold in autumn, bare grey-brown twigs in
 * winter, green again once the snow is gone.
 */
export function makeTreeMaterial(larch = false): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowLineY = SEASON_UNIFORMS.uSnowLineY;
    shader.uniforms.uAutumn = SEASON_UNIFORMS.uAutumn;
    shader.uniforms.uBare = SEASON_UNIFORMS.uBare;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float treeSnow;\nvarying vec3 vTreeWorld;\nvarying float vTreeSnow;",
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
${WORLD_POS_GLSL}
  vTreeWorld = seasonWorld.xyz;
  vTreeSnow = treeSnow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTreeWorld;\nvarying float vTreeSnow;\nuniform float uSnowLineY;\nuniform float uAutumn;\nuniform float uBare;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  #if ${larch ? 1 : 0}
  {
    // Needles turn by brightness, so the tiers keep their light and shade.
    float larchLight = clamp(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / 0.09, 0.3, 1.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.24, 0.03) * larchLight, uAutumn * 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.07, 0.055) * larchLight, uBare * 0.55);
  }
  #endif
  // Snow where the geometry says branches carry it, thinning out toward the
  // snow line, so trees in a green valley stay green.
  float treeCover = vTreeSnow * ${FEATHER_GLSL.replace("$Y", "vTreeWorld.y")};
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.97), treeCover * 0.85);`,
      );
  };
  mat.customProgramCacheKey = () => (larch ? "tree-snow-larch" : "tree-snow");
  return mat;
}

/**
 * Snow on roofs that comes and goes with the season.
 *
 * A model's snow is baked into its vertex colours (bake.ts), tagged per
 * vertex by a `roofSnow` attribute: 1 on a roof, 2 on the cap of a pine. Where
 * the building stands above the season's snow line the white stays; below it
 * the roof shows its shingles. Geometry without the attribute reads 0 and is
 * left alone, so the patch is safe on a material shared by everything.
 */
export function withRoofSnow<T extends THREE.Material>(material: T, key: string): T {
  const roof = new THREE.Color("#6f5f52");
  const pine = new THREE.Color("#254a30");
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowLineY = SEASON_UNIFORMS.uSnowLineY;
    shader.uniforms.uRoofTone = { value: roof };
    shader.uniforms.uPineTone = { value: pine };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float roofSnow;\nvarying float vRoofSnow;\nvarying float vRoofY;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
${WORLD_POS_GLSL}
  vRoofY = seasonWorld.y;
  vRoofSnow = roofSnow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vRoofSnow;\nvarying float vRoofY;\nuniform float uSnowLineY;\nuniform vec3 uRoofTone;\nuniform vec3 uPineTone;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  if (vRoofSnow > 0.5) {
    float roofBare = 1.0 - ${FEATHER_GLSL.replace("$Y", "vRoofY")};
    diffuseColor.rgb = mix(diffuseColor.rgb, vRoofSnow > 1.5 ? uPineTone : uRoofTone, roofBare);
  }`,
      );
  };
  material.customProgramCacheKey = () => `roof-snow-${key}`;
  return material;
}

/** Mark a model's snow material, so the bake tags its vertices (see `withRoofSnow`). */
export const ROOF_SNOW = { roofSnow: 1 } as const;
/** The same for the snow cap on a tree. */
export const TREE_SNOW_CAP = { roofSnow: 2 } as const;
