// Explicit extension so the node test runner can load this directly.
import { CLASSIC_REGION } from "../../../../packages/config/src/regions.ts";
import type { Heightmap } from "../../../lib/game/alpine.ts";
import type { QualityTier } from "./quality.ts";

export interface View {
  at: [number, number, number];
  target: [number, number, number];
}

const METERS_TO_Y = 0.0215;
const BASE_M = 1560;

/**
 * The opening view of a map: the camera on the village side, looking up at
 * the mountains, at the tier's distance and pitch.
 *
 * The classic valley keeps its hand-tuned framing. A real map has its
 * mountains wherever they are, so the direction comes from the ground: from
 * the high ground's centre of mass toward the village. The target sits a
 * little way up the slope from the village, so both the village and the
 * mountain it serves are in frame.
 */
export function openingView(hm: Heightmap, tier: QualityTier): View {
  if (hm.region.id === CLASSIC_REGION) return { at: tier.cameraAt, target: tier.cameraTarget };
  const v = hm.region.village;
  // Centre of the highest fifth of the window.
  const sorted = Float32Array.from(hm.elev).sort();
  const cut = sorted[Math.floor(sorted.length * 0.8)]!;
  let sx = 0;
  let sz = 0;
  let count = 0;
  for (let iz = 0; iz < hm.n; iz++) {
    for (let ix = 0; ix < hm.n; ix++) {
      if (hm.elev[iz * hm.n + ix]! < cut) continue;
      sx += (ix / (hm.n - 1) - 0.5) * hm.world;
      sz += (iz / (hm.n - 1) - 0.5) * hm.world;
      count++;
    }
  }
  const hx = count ? sx / count : 0;
  const hz = count ? sz / count : -1;
  let dx = v.x - hx;
  let dz = v.z - hz;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const tx = v.x - dx * Math.min(28, len * 0.35);
  const tz = v.z - dz * Math.min(28, len * 0.35);
  const ty = (hm.sample(tx, tz) - BASE_M) * METERS_TO_Y;
  // Same distance and pitch as the tier's own framing.
  const ox = tier.cameraAt[0] - tier.cameraTarget[0];
  const oy = tier.cameraAt[1] - tier.cameraTarget[1];
  const oz = tier.cameraAt[2] - tier.cameraTarget[2];
  const flat = Math.hypot(ox, oz);
  const half = hm.world / 2;
  const clamp = (n: number) => Math.max(-half * 1.1, Math.min(half * 1.1, n));
  return {
    at: [clamp(tx + dx * flat), ty + oy, clamp(tz + dz * flat)],
    target: [tx, ty, tz],
  };
}
