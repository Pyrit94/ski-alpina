import { createNoise2D } from "simplex-noise";
import { getDem } from "@ski/shared";
import { mulberry32, seedFromString } from "./rng";

export const WORLD_SIZE = 196;
export const MAP_RES = 192;
export const ALPINE_SEED = "zermatt-alpina-wallis-2026";

export interface Peak {
  id: string;
  name: string;
  elev: number;
  lat: number;
  lon: number;
  x: number;
  z: number;
  radius: number;
  sharpness: number;
}

/** Real Walliser Gipfel, komprimiert in eine spielbare Schüssel. */
export const PEAKS: Peak[] = [
  { id: "matterhorn", name: "Matterhorn", elev: 4478, lat: 45.9763, lon: 7.6586, x: -46, z: -58, radius: 30, sharpness: 1.85 },
  { id: "klein", name: "Klein Matterhorn", elev: 3883, lat: 45.9384, lon: 7.7297, x: 6, z: -64, radius: 22, sharpness: 1.35 },
  { id: "breithorn", name: "Breithorn", elev: 4164, lat: 45.941, lon: 7.748, x: 34, z: -60, radius: 24, sharpness: 1.2 },
  { id: "gornergrat", name: "Gornergrat", elev: 3135, lat: 45.9836, lon: 7.7847, x: 36, z: -18, radius: 20, sharpness: 0.95 },
  { id: "rothorn", name: "Unterrothorn", elev: 3103, lat: 46.021, lon: 7.81, x: 52, z: 4, radius: 16, sharpness: 1.05 },
  { id: "riffelhorn", name: "Riffelhorn", elev: 2928, lat: 45.982, lon: 7.76, x: 14, z: -30, radius: 10, sharpness: 1.45 },
  { id: "stockhorn", name: "Stockhorn", elev: 3532, lat: 45.967, lon: 7.8, x: 48, z: -38, radius: 14, sharpness: 1.25 },
];

export const VILLAGE = { name: "Alpina Dorf", x: -4, z: 40, elev: 1608 };
export const LAKE = { name: "Riffelsee", x: 22, z: -24, elev: 2757, radius: 9.5 };

const RIDGES: [string, string][] = [
  ["matterhorn", "klein"],
  ["klein", "breithorn"],
  ["breithorn", "stockhorn"],
  ["gornergrat", "rothorn"],
  ["riffelhorn", "gornergrat"],
  ["klein", "riffelhorn"],
];

export interface Heightmap {
  n: number;
  world: number;
  elev: Float32Array;
  water: Uint8Array;
  sample: (x: number, z: number) => number;
  worldY: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
}

export function metersToWorldY(m: number) {
  return (m - 1560) * 0.0215;
}

function peakHeight(p: Peak, x: number, z: number) {
  const dx = x - p.x;
  const dz = z - p.z;
  const n = Math.sqrt(dx * dx + dz * dz) / p.radius;
  if (n > 3.2) return 0;
  return p.elev * Math.exp(-Math.pow(n, p.sharpness));
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + abx * t;
  const qz = az + abz * t;
  return { d: Math.hypot(px - qx, pz - qz), t };
}

function fbm(noise: (x: number, y: number) => number, x: number, z: number, octaves = 5) {
  let v = 0;
  let a = 1;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, z * f);
    n += a;
    a *= 0.5;
    f *= 2.05;
  }
  return v / n;
}

export function createHeightmap(seed = ALPINE_SEED): Heightmap {
  const rng = mulberry32(seedFromString(seed));
  const noise = createNoise2D(rng);
  const ridgeNoise = createNoise2D(mulberry32(seedFromString(seed + "-ridge")));
  const n = MAP_RES;
  const world = WORLD_SIZE;
  const elev = new Float32Array(n * n);
  const water = new Uint8Array(n * n);
  const peakById = Object.fromEntries(PEAKS.map((p) => [p.id, p]));

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = (ix / (n - 1) - 0.5) * world;
      const z = (iz / (n - 1) - 0.5) * world;

      const trough = 1588 + Math.pow(Math.abs(x + 2) / 26, 1.85) * 520;
      const north = Math.max(0, -z - 8) * 9.5;
      let h = trough + north * 0.18;

      for (const p of PEAKS) {
        h = Math.max(h, peakHeight(p, x, z));
      }

      for (const [aId, bId] of RIDGES) {
        const a = peakById[aId];
        const b = peakById[bId];
        if (!a || !b) continue;
        const { d, t } = distToSegment(x, z, a.x, a.z, b.x, b.z);
        const ridgeH = a.elev * (1 - t) + b.elev * t;
        const width = 7 + (1 - Math.abs(t - 0.5) * 2) * 4;
        if (d < width * 2.4) {
          const w = Math.exp(-Math.pow(d / width, 2));
          h = Math.max(h, ridgeH * 0.72 * w + h * (1 - w * 0.55));
        }
      }

      const warp = fbm(ridgeNoise, x * 0.012, z * 0.012, 3);
      h += fbm(noise, x * 0.018 + warp * 0.4, z * 0.018, 5) * (55 + h * 0.018);

      const edge = Math.max(Math.abs(x), Math.abs(z)) / (world * 0.5);
      if (edge > 0.78) {
        h += Math.pow((edge - 0.78) / 0.22, 1.6) * 900;
      }

      const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
      if (ld < LAKE.radius * 1.35) {
        const k = 1 - Math.min(1, ld / (LAKE.radius * 1.35));
        h = h * (1 - k) + LAKE.elev * k;
        if (ld < LAKE.radius * 0.92) {
          h = LAKE.elev - 6;
          water[iz * n + ix] = 1;
        }
      }

      const vd = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
      if (vd < 16) {
        const k = 1 - vd / 16;
        h = h * (1 - k * 0.55) + VILLAGE.elev * (k * 0.55);
      }

      elev[iz * n + ix] = h;
    }
  }

  const sample = (x: number, z: number) => {
    const u = (x / world + 0.5) * (n - 1);
    const v = (z / world + 0.5) * (n - 1);
    const x0 = Math.max(0, Math.min(n - 2, Math.floor(u)));
    const z0 = Math.max(0, Math.min(n - 2, Math.floor(v)));
    const tx = u - x0;
    const tz = v - z0;
    const e00 = elev[z0 * n + x0];
    const e10 = elev[z0 * n + x0 + 1];
    const e01 = elev[(z0 + 1) * n + x0];
    const e11 = elev[(z0 + 1) * n + x0 + 1];
    return e00 * (1 - tx) * (1 - tz) + e10 * tx * (1 - tz) + e01 * (1 - tx) * tz + e11 * tx * tz;
  };

  const worldY = (x: number, z: number) => metersToWorldY(sample(x, z));

  const slope = (x: number, z: number) => {
    const d = 1.2;
    const dx = worldY(x + d, z) - worldY(x - d, z);
    const dz = worldY(x, z + d) - worldY(x, z - d);
    return Math.hypot(dx, dz) / (2 * d);
  };

  const isWater = (x: number, z: number) => {
    const u = Math.round((x / world + 0.5) * (n - 1));
    const v = Math.round((z / world + 0.5) * (n - 1));
    if (u < 0 || v < 0 || u >= n || v >= n) return false;
    return water[v * n + u] === 1;
  };

  return { n, world, elev, water, sample, worldY, slope, isWater };
}

let cached: Heightmap | null = null;
export function getHeightmap(): Heightmap {
  if (!cached) {
    const dem = getDem();
    cached = {
      n: dem.n,
      world: dem.world,
      elev: dem.elev,
      water: dem.water,
      sample: dem.sample,
      worldY: dem.worldY,
      slope: dem.slope,
      isWater: dem.isWater,
    };
  }
  return cached;
}

/** Render-only micro-relief. Never used by validate/sim. */
export function visualRelief(x: number, z: number): number {
  return Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.28 + Math.sin(x * 0.73 + z * 0.41) * 0.12;
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
  const vd = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
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
  const vd = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
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
      y: hm.worldY(x, z),
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
      y: hm.worldY(x, z),
      z,
      s: 0.4 + rng() * 1.4,
      r: rng() * Math.PI,
    });
  }
  return out;
}
