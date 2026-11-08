// Explicit extensions so the node test runner can load this directly.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SEASON_UNIFORMS } from "./snow-shaders.ts";

/**
 * Runs as groomed snow lying on the mountain, not as coloured tape.
 *
 * The old look was two flat strips through the hex centres: a coloured one and
 * a white one on top. From the play camera that read as a thin red or blue
 * line — a road, not a piste. Here a run is one strip that
 *
 * - follows a smoothed line instead of the hex zigzag,
 * - is draped: every vertex sits on the ground under it, so a wide run lies on
 *   a ridge or in a gully instead of floating over it,
 * - is white corduroy with groomer lanes, a thin edge line in the grade colour
 *   and a soft outer edge that melts into the open snow,
 *
 * and difficulty is carried by marker poles along the side, as on a real
 * mountain. All runs share one geometry and one material (one draw call), and
 * all poles one instanced mesh (one more).
 */

export interface PathPoint {
  x: number;
  z: number;
}

/** Ground height under a world point, including the visual relief. */
export type GroundAt = (x: number, z: number) => number;

/**
 * Centripetal Catmull-Rom through the points, `steps` samples per span.
 *
 * Centripetal so a sharp hex corner rounds off without overshooting into a
 * loop, which the uniform variant does on short spans.
 */
export function smoothPath(points: readonly PathPoint[], steps = 4): PathPoint[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, z: p.z }));
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p.x, 0, p.z)),
    false,
    "centripetal",
  );
  const n = (points.length - 1) * steps;
  return curve.getSpacedPoints(n).map((v) => ({ x: v.x, z: v.z }));
}

export interface RibbonStyle {
  width: number;
  /** Edge-line and pole colour. */
  color: THREE.Color;
  /** Asphalt instead of snow: no corduroy, a dashed centre line. */
  road?: boolean;
  /** Metres-equivalent the strip floats above the ground, against z-fighting. */
  lift?: number;
  /** Fade in over this much of the start, and out over this much of the end (world units). */
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * A strip of `style.width` along `path`, each vertex on the ground beneath it.
 *
 * Attributes: `position`, `normal` (from the draped surface), `color` (grade),
 * `pisteUv` (x: 0..1 across, y: distance along) and `pisteW` (width; negative
 * marks a road).
 */
export function drapedRibbon(path: readonly PathPoint[], style: RibbonStyle, ground: GroundAt): THREE.BufferGeometry {
  if (path.length < 2) return new THREE.BufferGeometry();
  const lift = style.lift ?? 0.1;
  const half = style.width / 2;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const w: number[] = [];
  const fade: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  const fadeIn = style.fadeIn ?? 0;
  const fadeOut = style.fadeOut ?? 0;
  let along = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Right of the direction of travel, so the triangles below wind
    // counter-clockwise seen from above and face the sky.
    const sx = dz * half;
    const sz = -dx * half;
    if (i > 0) along += Math.hypot(p.x - path[i - 1]!.x, p.z - path[i - 1]!.z);
    for (const [k, side] of [
      [0, 1],
      [1, -1],
    ] as const) {
      const x = p.x + sx * side;
      const z = p.z + sz * side;
      // The middle of a wide run can sit lower than its edges in a gully;
      // lifting by the higher of edge and centre keeps it above both.
      const y = Math.max(ground(x, z), ground(p.x, p.z) - 0.05) + lift;
      pos.push(x, y, z);
      col.push(style.color.r, style.color.g, style.color.b);
      uv.push(k, along);
      w.push(style.road ? -style.width : style.width);
      // Where a run joins another, it melts into it instead of ending square.
      const a = fadeIn > 0 ? Math.min(1, along / fadeIn) : 1;
      const b = fadeOut > 0 ? Math.min(1, (total - along) / fadeOut) : 1;
      fade.push(Math.max(0, Math.min(a, b)));
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("pisteUv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("pisteW", new THREE.Float32BufferAttribute(w, 1));
  geo.setAttribute("pisteFade", new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A groomed round where runs and a lift station meet: one draped disc in the
 * run material, white to the rim and soft at the edge, so the ends of runs
 * arriving and leaving merge into one patch of snow instead of crossing.
 */
export function snowPlaza(cx: number, cz: number, radius: number, ground: GroundAt, segments = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const w: number[] = [];
  const fade: number[] = [];
  const snow = [0.965, 0.978, 1];
  const push = (x: number, z: number, u: number) => {
    pos.push(x, ground(x, z) + 0.1, z);
    col.push(snow[0]!, snow[1]!, snow[2]!);
    uv.push(u, 0);
    w.push(radius * 2);
    fade.push(1);
  };
  push(cx, cz, 0.5);
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    push(cx + Math.cos(t) * radius, cz + Math.sin(t) * radius, 0);
  }
  const idx: number[] = [];
  // Counter-clockwise seen from above, so the disc faces the sky.
  for (let i = 1; i <= segments; i++) idx.push(0, i + 1, i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("pisteUv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("pisteW", new THREE.Float32BufferAttribute(w, 1));
  geo.setAttribute("pisteFade", new THREE.Float32BufferAttribute(fade, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export interface RunLine {
  /** Relaxed world points along the run, top first. */
  points: PathPoint[];
  hexes: readonly { q: number; r: number }[];
}

/**
 * Where a run branches off another or flows into one, borrow a little of the
 * other run's line so the two meet tangentially: the points above the branch
 * on the other run go in front, the points below the junction go behind.
 * Returns the extended points and how much at each end is borrowed, to fade.
 */
export function joinRun(
  run: RunLine,
  others: readonly RunLine[],
  near: (a: { q: number; r: number }, b: { q: number; r: number }) => boolean,
): { points: PathPoint[]; fadeIn: number; fadeOut: number } {
  const first = run.hexes[0]!;
  const last = run.hexes[run.hexes.length - 1]!;
  let before: PathPoint[] = [];
  let after: PathPoint[] = [];
  for (const o of others) {
    if (o === run) continue;
    if (before.length === 0) {
      const k = o.hexes.findIndex((h, i) => i > 0 && i < o.hexes.length - 1 && near(h, first));
      if (k > 0) before = o.points.slice(Math.max(0, k - 2), k);
    }
    if (after.length === 0) {
      const k = o.hexes.findIndex((h, i) => i < o.hexes.length - 1 && near(h, last));
      if (k >= 0) after = o.points.slice(k + 1, k + 3);
    }
  }
  const length = (pts: PathPoint[], from: PathPoint | undefined) => {
    let n = 0;
    let prev = from;
    for (const p of pts) {
      if (prev) n += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    return n;
  };
  // The run's own end point sits beside the other line, not on it; leaving it
  // out lets the curve swing into the other line instead of kinking at it.
  let own = run.points;
  if (after.length && own.length > 3) own = own.slice(0, -1);
  if (before.length && own.length > 3) own = own.slice(1);
  const points = [...before, ...own, ...after];
  return {
    points,
    fadeIn: before.length ? length([...before, own[0]!], undefined) : 0,
    fadeOut: after.length ? length(after, own[own.length - 1]) : 0,
  };
}

/** Merge strips into one geometry, disposing the parts. Null when empty. */
export function mergeRibbons(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const real = parts.filter((g) => g.attributes.position);
  if (real.length === 0) return null;
  const merged = mergeGeometries(real);
  for (const g of parts) g.dispose();
  return merged;
}

export interface Pole {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
}

/**
 * Marker poles every `spacing` along the run, alternating sides, just
 * outside its edge — the way a Swiss run is marked.
 */
export function markerPoles(
  path: readonly PathPoint[],
  width: number,
  color: THREE.Color,
  ground: GroundAt,
  spacing: number,
): Pole[] {
  const out: Pole[] = [];
  if (path.length < 2) return out;
  let next = spacing * 0.5;
  let along = 0;
  let side = 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg <= 0) continue;
    while (next <= along + seg) {
      const t = (next - along) / seg;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const nx = -(b.z - a.z) / seg;
      const nz = (b.x - a.x) / seg;
      const off = width / 2 + 0.25;
      const px = x + nx * off * side;
      const pz = z + nz * off * side;
      out.push({ x: px, y: ground(px, pz), z: pz, color });
      side = -side;
      next += spacing;
    }
    along += seg;
  }
  return out;
}

/**
 * The run material: groomed snow, grade edge, soft border; asphalt for roads.
 *
 * A MeshStandardMaterial with a patched fragment stage, so it keeps the
 * scene's lights, fog, shadows and tone mapping. `fine` adds the corduroy
 * texture inside each groomer lane; the phone tier keeps only the lanes.
 */
/**
 * `outline` keeps the grade line strong off the snow — the «Pisten» layer,
 * where a run in July still has to be found and picked.
 *
 * Off the snow a run is a faint mown track: white only where the season's
 * snow lies or the simulation keeps the run open (snowmaking included), so
 * the ribbon says what the run does today. Both lines come in through
 * SEASON_UNIFORMS; nothing here is rebuilt when they move.
 */
export function makePisteMaterial(fine: boolean, opacity = 1, outline = false): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOpacity = { value: opacity };
    shader.uniforms.uSnowLineY = SEASON_UNIFORMS.uSnowLineY;
    shader.uniforms.uRunLineY = SEASON_UNIFORMS.uRunLineY;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 pisteUv;\nattribute float pisteW;\nattribute float pisteFade;\nvarying vec2 vPisteUv;\nvarying float vPisteW;\nvarying float vPisteFade;\nvarying float vPisteY;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvPisteUv = pisteUv;\nvPisteW = pisteW;\nvPisteFade = pisteFade;\nvPisteY = (modelMatrix * vec4(transformed, 1.0)).y;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vPisteUv;
varying float vPisteW;
varying float vPisteFade;
varying float vPisteY;
uniform float uOpacity;
uniform float uSnowLineY;
uniform float uRunLineY;`,
      )
      .replace(
        "#include <color_fragment>",
        `
  float pu = vPisteUv.x;
  float road = step(vPisteW, 0.0);
  float width = abs(vPisteW);
  // Distance from the nearer edge, in world units.
  float fromEdge = min(pu, 1.0 - pu) * width;
  // A line in the grade colour just inside the border, wide enough to read
  // from the play camera.
  float line = 1.0 - smoothstep(0.1, 0.18, abs(fromEdge - 0.2));
  // Groomer lanes: a pass is a few metres wide, so a handful across a run.
  float laneX = pu * width * 2.2;
  float lane = 0.5 + 0.5 * cos(laneX * 6.2831853);
  float laneAA = clamp(fwidth(laneX) * 1.5, 0.0, 1.0);
  lane = mix(lane, 0.5, laneAA);
  vec3 snow = vec3(0.965, 0.978, 1.0) * (0.93 + 0.07 * lane);
  #if ${fine ? 1 : 0}
    // Corduroy: fine ribs along the run, faded out where they would alias.
    float ribX = pu * width * 14.0;
    float rib = 0.5 + 0.5 * cos(ribX * 6.2831853);
    rib = mix(rib, 0.5, clamp(fwidth(ribX) * 1.2, 0.0, 1.0));
    snow *= 0.975 + 0.025 * rib;
  #endif
  // Snow where the season lays it, or where the run is still open: the
  // simulation fades a run out over 400 m below its line, about 8.6 units.
  float onSnow = max(
    smoothstep(uSnowLineY - 2.8, uSnowLineY + 2.8, vPisteY),
    smoothstep(uRunLineY - 6.0, uRunLineY - 1.0, vPisteY));
  // Off the snow, a mown track: a shade lighter and yellower than the meadow,
  // the lanes still showing where the mower went.
  vec3 grass = vec3(0.25, 0.33, 0.1) * (0.92 + 0.12 * lane);
  vec3 ground = mix(grass, snow, onSnow);
  vec3 runColor = mix(ground, vColor.rgb, line * 0.95 * mix(${outline ? "0.95" : "0.3"}, 1.0, onSnow));
  // Asphalt: the stored colour, a dashed white centre line.
  float dash = step(0.5, fract(vPisteUv.y * 0.35)) * (1.0 - smoothstep(0.03, 0.06, abs(pu - 0.5) * width));
  vec3 roadColor = mix(vColor.rgb * 0.85, vec3(0.92), dash * 0.8);
  diffuseColor.rgb = mix(runColor, roadColor, road);
  // A soft outer border so the run melts into the open snow beside it.
  diffuseColor.a *= uOpacity * smoothstep(0.0, mix(0.22, 0.05, road), fromEdge) * smoothstep(0.0, 1.0, vPisteFade);
  // A track in the grass is faint; the road and the runs on snow are not.
  diffuseColor.a *= mix(mix(${outline ? "0.8" : "0.45"}, 1.0, onSnow), 1.0, road);
`,
      );
  };
  // Distinct program per variant: the define above is baked into the source.
  mat.customProgramCacheKey = () => `piste-${fine ? 1 : 0}-${outline ? 1 : 0}`;
  return mat;
}
