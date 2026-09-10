import { LAKE, PEAKS, RIDGES, TERRAIN, VILLAGE } from "../../../config/src/terrain.ts";

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

  const slope = (x: number, z: number) => {
    const e = 1.6;
    const dx = sample(x + e, z) - sample(x - e, z);
    const dz = sample(x, z + e) - sample(x, z - e);
    return Math.hypot(dx, dz) / (2 * e * 12);
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

  return { n, world, elev, water, sample, slope, aspect, isWater, worldY };
}

let cached: Dem | null = null;
export function getDem(): Dem {
  cached ??= generateDem();
  return cached;
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
