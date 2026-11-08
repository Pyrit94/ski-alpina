import { LAKE, PEAKS, RIDGES, TERRAIN, VILLAGE } from "../../../config/src/terrain.ts";
import { CLASSIC_REGION, REGION_BY_ID, VILLAGE_GAME_ELEV, type RegionDef } from "../../../config/src/regions.ts";
import { worldToHex, type Axial } from "../hex.ts";

/** What makes one map this map: its village, its peaks, its horizon. */
export interface RegionGeo {
  id: string;
  name: string;
  village: { name: string; x: number; z: number };
  /** The village's hex: where guests arrive and runs can end. */
  villageHex: Axial;
  /** Labelled summits, `elev` in real metres. */
  peaks: { name: string; x: number; z: number; elev: number }[];
  /** Gameplay metres = real metres + offset (see config/regions.ts). */
  offset: number;
  lake: { x: number; z: number; elev: number; radius: number } | null;
  /** The land around the play window, gameplay metres, centred on it. */
  far: { n: number; world: number; elev: Float32Array } | null;
}

export interface Dem {
  n: number;
  world: number;
  elev: Float32Array;
  water: Uint8Array;
  sample: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
  aspect: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  worldY: (x: number, z: number) => number;
  region: RegionGeo;
}

function peakHeight(
  p: (typeof PEAKS)[number],
  x: number,
  z: number,
): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const n = Math.sqrt(dx * dx + dz * dz) / p.radius;
  if (n > 3.2) return 0;
  return p.elev * Math.exp(-Math.pow(n, p.sharpness));
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - ax - abx * t, pz - az - abz * t), t };
}

/**
 * Gameplay DEM. No procedural micro-relief — that is render-only.
 * Control points are real Wallis peak elevations (Copernicus GLO-30).
 */
export function generateDem(): Dem {
  const n = TERRAIN.resolution;
  const world = TERRAIN.worldSize;
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
      for (const p of PEAKS) h = Math.max(h, peakHeight(p, x, z));
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
      const edge = Math.max(Math.abs(x), Math.abs(z)) / (world * 0.5);
      if (edge > 0.78) h += Math.pow((edge - 0.78) / 0.22, 1.6) * 900;
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

  return makeDem(n, world, elev, water, CLASSIC_GEO);
}

/** The hand-made valley the game started with, as a region. */
const CLASSIC_GEO: RegionGeo = {
  id: CLASSIC_REGION,
  name: "Alpina",
  village: { name: "Alpina Dorf", x: VILLAGE.x, z: VILLAGE.z },
  villageHex: worldToHex(VILLAGE.x, VILLAGE.z),
  peaks: PEAKS.map((p) => ({ name: p.name, x: p.x, z: p.z, elev: p.elev })),
  offset: 0,
  lake: { x: LAKE.x, z: LAKE.z, elev: LAKE.elev, radius: LAKE.radius },
  far: null,
};

/** Build the sampling functions over an elevation grid. */
function makeDem(n: number, world: number, elev: Float32Array, water: Uint8Array, region: RegionGeo): Dem {
  const sample = (x: number, z: number) => {
    const u = (x / world + 0.5) * (n - 1);
    const v = (z / world + 0.5) * (n - 1);
    const x0 = Math.max(0, Math.min(n - 2, Math.floor(u)));
    const z0 = Math.max(0, Math.min(n - 2, Math.floor(v)));
    const tx = u - x0;
    const tz = v - z0;
    const i00 = z0 * n + x0;
    const i10 = z0 * n + x0 + 1;
    const i01 = (z0 + 1) * n + x0;
    const i11 = (z0 + 1) * n + x0 + 1;
    const a = elev[i00]! * (1 - tx) + elev[i10]! * tx;
    const b = elev[i01]! * (1 - tx) + elev[i11]! * tx;
    return a * (1 - tz) + b * tz;
  };

  /** Gradient magnitude: metres of rise over metres of run. */
  const slope = (x: number, z: number) => {
    const e = 1.6;
    const dx = sample(x + e, z) - sample(x - e, z);
    const dz = sample(x, z + e) - sample(x, z - e);
    return Math.hypot(dx, dz) / (2 * e * TERRAIN.metresPerWorldUnit);
  };

  const aspect = (x: number, z: number) => {
    const e = 1.6;
    return Math.atan2(sample(x, z + e) - sample(x, z - e), sample(x + e, z) - sample(x - e, z));
  };

  const isWater = (x: number, z: number) => {
    const u = Math.round((x / world + 0.5) * (n - 1));
    const v = Math.round((z / world + 0.5) * (n - 1));
    const ix = Math.max(0, Math.min(n - 1, u));
    const iz = Math.max(0, Math.min(n - 1, v));
    return water[iz * n + ix] === 1;
  };

  const worldY = (x: number, z: number) => (sample(x, z) - TERRAIN.minPlayElev) * TERRAIN.metersToWorldY;

  return { n, world, elev, water, sample, slope, aspect, isWater, worldY, region };
}

/** World x/z of a lat/lon in a region: +x east, +z south (see scripts/build-regions.mjs). */
export function regionPoint(def: RegionDef, lat: number, lon: number): { x: number; z: number } {
  const east = (lon - def.center.lon) * 111320 * Math.cos((def.center.lat * Math.PI) / 180);
  const north = (lat - def.center.lat) * 110574;
  return { x: east / TERRAIN.metresPerWorldUnit, z: -north / TERRAIN.metresPerWorldUnit };
}

/** How far a labelled summit may move to land on the true top, in km. */
const PEAK_SNAP_KM = 1.0;

function summitNear(dem: Dem, at: { x: number; z: number }): { x: number; z: number; elev: number } {
  const reach = (PEAK_SNAP_KM * 1000) / TERRAIN.metresPerWorldUnit;
  const step = dem.world / (dem.n - 1);
  let best = { x: at.x, z: at.z, elev: dem.sample(at.x, at.z) };
  for (let dz = -reach; dz <= reach; dz += step) {
    for (let dx = -reach; dx <= reach; dx += step) {
      if (dx * dx + dz * dz > reach * reach) continue;
      const x = at.x + dx;
      const z = at.z + dz;
      if (Math.abs(x) > dem.world / 2 || Math.abs(z) > dem.world / 2) continue;
      const e = dem.sample(x, z);
      if (e > best.elev) best = { x, z, elev: e };
    }
  }
  return { ...best, elev: Math.round(best.elev) };
}

function decodeInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export interface RegionData {
  near: { n: number; world: number; b64: string };
  far: { n: number; world: number; b64: string };
}

/** A real region's DEM from its baked data. Elevations become gameplay metres. */
export function regionDem(def: RegionDef, data: RegionData): Dem {
  const n = data.near.n;
  const world = data.near.world;
  const real = decodeInt16(data.near.b64);
  const raw = makeDem(n, world, Float32Array.from(real), new Uint8Array(n * n), {
    id: def.id,
    name: def.name,
    village: { name: def.village.name, ...regionPoint(def, def.village.lat, def.village.lon) },
    villageHex: { q: 0, r: 0 },
    peaks: [],
    offset: 0,
    lake: null,
    far: null,
  });
  const village = regionPoint(def, def.village.lat, def.village.lon);
  const offset = Math.round(VILLAGE_GAME_ELEV - raw.sample(village.x, village.z));
  const elev = Float32Array.from(real, (v) => v + offset);
  const farReal = decodeInt16(data.far.b64);
  const region: RegionGeo = {
    id: def.id,
    name: def.name,
    village: { name: def.village.name, ...village },
    villageHex: worldToHex(village.x, village.z),
    // A name goes on the summit itself: the highest ground within
    // PEAK_SNAP_KM of the given point, which forgives a rounded coordinate.
    peaks: def.peaks.map((p) => ({ name: p.name, ...summitNear(raw, regionPoint(def, p.lat, p.lon)) })),
    offset,
    lake: null,
    far: { n: data.far.n, world: data.far.world, elev: Float32Array.from(farReal, (v) => v + offset) },
  };
  return makeDem(n, world, elev, lakeMask(def, real, n, world), region);
}

/** Metres either side of a lake's level that still count as its surface. */
const LAKE_NOISE_M = 3;

/**
 * The region's lakes as a grid mask. The elevation model holds a lake as one
 * flat level, so each lake is flooded from its point over the cells at that
 * level; a flat valley floor elsewhere stays land because nobody named it.
 */
export function lakeMask(def: Pick<RegionDef, "lakes" | "center">, real: ArrayLike<number>, n: number, world: number): Uint8Array {
  const water = new Uint8Array(n * n);
  const cellOf = (x: number, z: number) => ({
    ix: Math.round((x / world + 0.5) * (n - 1)),
    iz: Math.round((z / world + 0.5) * (n - 1)),
  });
  const at = (ix: number, iz: number) => real[iz * n + ix]!;
  const inside = (ix: number, iz: number) => ix > 0 && iz > 0 && ix < n - 1 && iz < n - 1;
  // How much a cell's 3×3 neighbourhood varies: open water is (nearly) level.
  const range = (ix: number, iz: number) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const v = at(ix + dx, iz + dz);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return hi - lo;
  };
  for (const lake of def.lakes ?? []) {
    const p = regionPoint(def as RegionDef, lake.lat, lake.lon);
    const c = cellOf(p.x, p.z);
    // The point may sit on the shore: take the levelest cell within reach.
    // The model is not perfectly flat on every lake, so a few metres of
    // noise still count as water.
    let seed: { ix: number; iz: number } | null = null;
    let best = LAKE_NOISE_M * 2 + 0.5;
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const ix = c.ix + dx;
        const iz = c.iz + dz;
        if (!inside(ix, iz)) continue;
        const r = range(ix, iz) + (dx * dx + dz * dz) * 0.01;
        if (r < best) {
          best = r;
          seed = { ix, iz };
        }
      }
    }
    if (!seed) continue;
    const level = at(seed.ix, seed.iz);
    const stack = [seed];
    let cells = 0;
    while (stack.length > 0 && cells < 600) {
      const { ix, iz } = stack.pop()!;
      const i = iz * n + ix;
      if (water[i] || !inside(ix, iz) || Math.abs(at(ix, iz) - level) > LAKE_NOISE_M) continue;
      water[i] = 1;
      cells++;
      stack.push({ ix: ix + 1, iz }, { ix: ix - 1, iz }, { ix, iz: iz + 1 }, { ix, iz: iz - 1 });
    }
  }
  return water;
}

/** Region id → its baked data, loaded on demand (one chunk per region in the browser). */
const REGION_DATA: Record<string, () => Promise<RegionData>> = {
  zermatt: () => import("./regions/zermatt.ts"),
  "flims-laax": () => import("./regions/flims-laax.ts"),
  "st-moritz": () => import("./regions/st-moritz.ts"),
  davos: () => import("./regions/davos.ts"),
  arosa: () => import("./regions/arosa.ts"),
  verbier: () => import("./regions/verbier.ts"),
  "saas-fee": () => import("./regions/saas-fee.ts"),
  engelberg: () => import("./regions/engelberg.ts"),
  grindelwald: () => import("./regions/grindelwald.ts"),
  andermatt: () => import("./regions/andermatt.ts"),
  "st-anton": () => import("./regions/st-anton.ts"),
  chamonix: () => import("./regions/chamonix.ts"),
};

const dems = new Map<string, Dem>();
let active = CLASSIC_REGION;

/** Whether a region id names a map this build can load. */
export function knownRegion(id: string | undefined | null): boolean {
  return !id || id === CLASSIC_REGION || id in REGION_DATA;
}

/** Load a region's DEM (once). The classic valley needs no loading. */
export async function loadRegion(id: string = CLASSIC_REGION): Promise<Dem> {
  const have = dems.get(id);
  if (have) return have;
  if (id === CLASSIC_REGION || !(id in REGION_DATA)) return getDem(CLASSIC_REGION);
  const def = REGION_BY_ID[id];
  if (!def) return getDem(CLASSIC_REGION);
  const dem = regionDem(def, await REGION_DATA[id]!());
  dems.set(id, dem);
  return dem;
}

/** Every region, for a server that must serve any game without waiting. */
export async function loadAllRegions(): Promise<void> {
  await Promise.all(Object.keys(REGION_DATA).map((id) => loadRegion(id)));
}

/** The map the client is showing; `getDem()` without an id answers with it. */
export function setActiveRegion(id: string): void {
  active = dems.has(id) ? id : CLASSIC_REGION;
}

/**
 * A region's DEM, which must have been loaded (see `loadRegion`). Without an
 * id: the active one. Unknown or unloaded regions fall back to the classic
 * valley rather than throwing in the middle of a frame.
 */
export function getDem(id: string = active): Dem {
  const have = dems.get(id);
  if (have) return have;
  const classic = dems.get(CLASSIC_REGION) ?? generateDem();
  dems.set(CLASSIC_REGION, classic);
  return classic;
}

export function encodeTerrainRgb(dem: Dem): Uint8Array {
  const n = dem.n;
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const meters = dem.elev[i]!;
    const encoded = Math.round((meters + 10000) * 10);
    out[i * 4] = (encoded >> 16) & 255;
    out[i * 4 + 1] = (encoded >> 8) & 255;
    out[i * 4 + 2] = encoded & 255;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function decodeTerrainRgbSample(r: number, g: number, b: number): number {
  return (r * 256 * 256 + g * 256 + b) / 10 - 10000;
}
