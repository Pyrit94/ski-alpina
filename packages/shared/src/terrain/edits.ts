import { HEX_DIRS, hexToWorld, worldToHex } from "../hex.ts";
import { TERRAIN } from "../../../config/src/terrain.ts";
import type { Dem } from "./dem.ts";

/** Levelled hexes, by "q,r": the gameplay height each was flattened to. */
export type TerrainEdits = Record<string, number>;

/** Flat out to here from a levelled hex's centre (world units)… */
const FLAT = 1.9;
/** …and back on the natural ground by here. */
const BLEND = 3.4;

const cache = new WeakMap<Dem, WeakMap<TerrainEdits, Dem>>();

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * The ground with the levelled hexes in it: the same Dem shape, so every
 * rule and every drawing reads it unchanged. Each levelled hex is flat over
 * most of its area and eases back into the slope around it.
 */
export function withEdits(dem: Dem, edits: TerrainEdits | undefined): Dem {
  if (!edits || Object.keys(edits).length === 0) return dem;
  let byEdits = cache.get(dem);
  if (!byEdits) {
    byEdits = new WeakMap();
    cache.set(dem, byEdits);
  }
  const hit = byEdits.get(edits);
  if (hit) return hit;

  const sample = (x: number, z: number) => {
    const base = dem.sample(x, z);
    const h = worldToHex(x, z);
    let weight = 0;
    let level = base;
    for (const d of [{ q: 0, r: 0 }, ...HEX_DIRS]) {
      const q = h.q + d.q;
      const r = h.r + d.r;
      const target = edits[`${q},${r}`];
      if (target === undefined) continue;
      const c = hexToWorld(q, r);
      const w = 1 - smooth((Math.hypot(x - c.x, z - c.z) - FLAT) / (BLEND - FLAT));
      if (w > weight) {
        weight = w;
        level = target;
      }
    }
    return base + (level - base) * weight;
  };
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
  const worldY = (x: number, z: number) => (sample(x, z) - TERRAIN.minPlayElev) * TERRAIN.metersToWorldY;
  const edited: Dem = { ...dem, sample, slope, aspect, worldY };
  byEdits.set(edits, edited);
  return edited;
}
