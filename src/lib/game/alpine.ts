import { getDem, type RegionGeo } from "@ski/shared";

export const WORLD_SIZE = 196;
export const MAP_RES = 192;
export const ALPINE_SEED = "zermatt-alpina-wallis-2026";

export interface Heightmap {
  n: number;
  world: number;
  elev: Float32Array;
  water: Uint8Array;
  sample: (x: number, z: number) => number;
  worldY: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  /** Village, peaks, lake and horizon of the map. */
  region: RegionGeo;
}

export function metersToWorldY(m: number) {
  return (m - 1560) * 0.0215;
}

const cached = new WeakMap<object, Heightmap>();
/** The active map's ground, for drawing (see `getDem`). */
export function getHeightmap(): Heightmap {
  const dem = getDem();
  let hm = cached.get(dem);
  if (!hm) {
    hm = {
      n: dem.n,
      world: dem.world,
      elev: dem.elev,
      water: dem.water,
      sample: dem.sample,
      worldY: dem.worldY,
      slope: dem.slope,
      isWater: dem.isWater,
      region: dem.region,
    };
    cached.set(dem, hm);
  }
  return hm;
}

/** Render-only micro-relief. Never used by validate/sim. */
export function visualRelief(x: number, z: number): number {
  return Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.28 + Math.sin(x * 0.73 + z * 0.41) * 0.12;
}

/**
 * Where the ground actually is on screen.
 *
 * `worldY` is the DEM, and it is what the simulation reasons about: a run's
 * descent, a lift's rise, whether a hex is too steep. The rendered mesh adds
 * `visualRelief` on top for shape the 30 m DEM cannot carry, so anything
 * placed at `worldY` alone sits up to 0.4 units off the surface it looks like
 * it is standing on — measured across trees and rocks, a median of 0.05 and a
 * worst case of 0.44, which buries some props and hovers others.
 *
 * Use this for anything visual. Use `worldY` for anything the rules depend
 * on, so decorative relief can never change what is buildable.
 */
export function surfaceY(hm: Heightmap, x: number, z: number): number {
  return hm.worldY(x, z) + visualRelief(x, z);
}


export type Biome = "ice" | "snow" | "rock" | "forest" | "meadow" | "village" | "glacier";

/**
 * Which ground this is.
 *
 * The thresholds are real tangents. They were originally written against a
 * slope that came out about eight times too steep, so once that was corrected
 * `s > 0.85` for rock never fired and nearly everything fell into one band —
 * which is what turned the mountain into a featureless white sheet.
 */
export function biomeAt(hm: Heightmap, x: number, z: number): Biome {
  if (hm.isWater(x, z)) return "ice";
  const m = hm.sample(x, z);
  const s = hm.slope(x, z);
  const vd = Math.hypot(x - hm.region.village.x, z - hm.region.village.z);
  if (vd < 14 && m < 1900 && s < 0.16) return "village";
  if (s > 0.62) return "rock";
  if (m > 3500 && s < 0.3) return "glacier";
  if (m > 2500) return "snow";
  if (m > 1800 && s < 0.5) return "forest";
  if (s < 0.3) return "meadow";
  return "snow";
}

/** 0 below `edge0`, 1 above `edge1`, eased in between. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type Rgb = [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Bands the ground colour passes through as it climbs, with room to blend. */
const GROUND = {
  meadow: [0.58, 0.63, 0.42] as Rgb,
  forest: [0.24, 0.38, 0.28] as Rgb,
  alpine: [0.66, 0.69, 0.64] as Rgb,
  // Deliberately short of white. Snow at 0.95 albedo has no headroom left to
  // shade into, so every slope renders at the same clipped value and the
  // mountain flattens into a paper cut-out. Held here, the sun lifts the lit
  // faces and the shading below still has somewhere to go.
  snow: [0.79, 0.83, 0.9] as Rgb,
  glacier: [0.71, 0.81, 0.91] as Rgb,
  rock: [0.42, 0.39, 0.36] as Rgb,
  scree: [0.55, 0.51, 0.46] as Rgb,
  village: [0.72, 0.66, 0.53] as Rgb,
  ice: [0.45, 0.68, 0.79] as Rgb,
};

/** Metres of blending either side of the snow line. */
const SNOW_FEATHER = 130;

/**
 * Ground colour at a point, blended rather than switched.
 *
 * Hard biome bands read as flat plates from above. Blending along elevation
 * gives the eye a gradient to follow, mixing rock in by steepness puts the
 * mountain's structure on the surface, and darkening with steepness bakes
 * relief into the vertex colour — so the shape stays readable even where the
 * sun happens to fall flat on the slope.
 *
 * `snowLineM` is the simulation's own snow line — the same number the HUD
 * prints and the one a run is refused for lying below. Without it the ground
 * only turned white above 2400 m on a fixed altitude ramp, so a resort whose
 * snow line sat at 1500 m rendered its entire skiable area as summer pasture:
 * the map contradicted the game. Pass it and winter looks like winter,
 * snowmaking visibly lowers the white, and a thaw visibly raises it.
 */
export function terrainColor(
  hm: Heightmap,
  x: number,
  z: number,
  snowLineM?: number,
): Rgb {
  if (hm.isWater(x, z)) return GROUND.ice;
  const m = hm.sample(x, z);
  const s = hm.slope(x, z);

  // Up through pasture, forest and the treeline.
  let c = mix(GROUND.meadow, GROUND.forest, smoothstep(1700, 1950, m));
  c = mix(c, GROUND.alpine, smoothstep(2050, 2400, m));

  // Then snow. With no snow line given, fall back to the old altitude ramp so
  // a caller without simulation stats (the minimap, a test) still gets a
  // plausible mountain.
  const snowCover =
    snowLineM === undefined
      ? smoothstep(2400, 2850, m)
      : smoothstep(snowLineM - SNOW_FEATHER, snowLineM + SNOW_FEATHER, m);
  c = mix(c, GROUND.snow, snowCover);
  c = mix(c, GROUND.glacier, smoothstep(3500, 3900, m) * (1 - smoothstep(0.3, 0.55, s)));

  // Steep ground sheds snow: scree first, then bare rock. Wind-scoured faces
  // stay bare however deep the snow is, which is what gives a white mountain
  // its structure instead of a smooth meringue.
  c = mix(c, GROUND.scree, smoothstep(0.4, 0.7, s));
  c = mix(c, GROUND.rock, smoothstep(0.7, 1.15, s));

  // The valley floor around the village reads as settled land.
  const vd = Math.hypot(x - hm.region.village.x, z - hm.region.village.z);
  c = mix(c, GROUND.village, (1 - smoothstep(6, 16, vd)) * (1 - smoothstep(0.1, 0.3, s)) * 0.75);

  // Relief baked into the colour, so form survives flat lighting.
  //
  // A plain multiply only greys snow down, and grey snow still reads flat.
  // Snow in shade is lit by the sky rather than the sun, so it goes darker AND
  // distinctly bluer — and on a surface with no albedo variation of its own,
  // that hue shift carries most of the shape.
  const shade = smoothstep(0.15, 1.3, s);
  const lit: Rgb = [c[0], c[1], c[2]];
  const shaded: Rgb = [c[0] * 0.6, c[1] * 0.68, c[2] * 0.82];
  return mix(lit, shaded, shade);
}

export function biomeColor(b: Biome): [number, number, number] {
  switch (b) {
    case "ice":
      return [0.62, 0.82, 0.9];
    case "glacier":
      return [0.9, 0.95, 0.98];
    case "snow":
      return [0.97, 0.98, 1];
    case "rock":
      return [0.55, 0.54, 0.52];
    case "forest":
      return [0.52, 0.64, 0.5];
    case "meadow":
      return [0.86, 0.88, 0.78];
    case "village":
      return [0.88, 0.86, 0.78];
  }
}

export interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  s: number;
  r: number;
}

export function scatterTrees(hm: Heightmap, count: number, rng: () => number): ScatterPoint[] {
  const out: ScatterPoint[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 18) {
    guard += 1;
    const x = (rng() - 0.5) * hm.world * 0.92;
    const z = (rng() - 0.5) * hm.world * 0.92;
    const b = biomeAt(hm, x, z);
    if (b !== "forest" && b !== "meadow") continue;
    if (hm.isWater(x, z)) continue;
    const s = hm.slope(x, z);
    if (s > 0.46) continue;
    const m = hm.sample(x, z);
    if (m > 2460 || m < 1680) continue;
    out.push({
      x,
      y: surfaceY(hm, x, z),
      z,
      s: 0.7 + rng() * 0.9,
      r: rng() * Math.PI * 2,
    });
  }
  return out;
}

export function scatterRocks(hm: Heightmap, count: number, rng: () => number): ScatterPoint[] {
  const out: ScatterPoint[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard += 1;
    const x = (rng() - 0.5) * hm.world * 0.92;
    const z = (rng() - 0.5) * hm.world * 0.92;
    const b = biomeAt(hm, x, z);
    if (b !== "rock" && b !== "snow") continue;
    if (hm.slope(x, z) < 0.42) continue;
    out.push({
      x,
      y: surfaceY(hm, x, z),
      z,
      s: 0.4 + rng() * 1.4,
      r: rng() * Math.PI,
    });
  }
  return out;
}
