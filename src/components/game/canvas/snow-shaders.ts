// Explicit extension so the node test runner can load this directly.
import * as THREE from "three";

/**
 * Snow lying on the conifers, in the shader: the geometry's `treeSnow`
 * attribute says where branches carry snow, and the tree's own height against
 * today's snow line says whether there is any. One instanced mesh keeps its
 * single draw call. `snowLineY` is in world units.
 */
export function makeTreeMaterial(snowLineY: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowLineY = { value: snowLineY };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float treeSnow;\nvarying vec3 vTreeWorld;\nvarying float vTreeSnow;",
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
  #ifdef USE_INSTANCING
    vec4 treeWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #else
    vec4 treeWorld = modelMatrix * vec4(transformed, 1.0);
  #endif
  vTreeWorld = treeWorld.xyz;
  vTreeSnow = treeSnow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vTreeWorld;\nvarying float vTreeSnow;\nuniform float uSnowLineY;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  // Snow where the geometry says branches carry it, thinning out toward the
  // snow line, so trees in a green valley stay green.
  float treeCover = vTreeSnow * smoothstep(uSnowLineY - 0.4, uSnowLineY + 2.5, vTreeWorld.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.97), treeCover * 0.85);`,
      );
  };
  mat.customProgramCacheKey = () => "tree-snow";
  return mat;
}
