/**
 * What the ground is made of and how much sky it sees, baked once per vertex.
 *
 * Pure numbers over the DEM grid — no three.js, no store — so it runs in the
 * node test runner and costs nothing per frame. The renderer reads the result
 * as two vertex attributes: an albedo (`color`) and an occlusion term the
 * terrain shader applies to sky light only, so gullies sit in cool shade
 * while the sun still reaches whatever it actually hits.
 */

import { LANDSCAPE } from "../../../../packages/config/src/regions.ts";

export type Rgb = [number, number, number];

/** sRGB hex to linear, which is what three expects in a colour attribute. */
function lin(h: number): Rgb {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255)];
}

/**
 * The palette, in sRGB as a designer would pick it.
 *
 * Snow is held off pure white so the sun has headroom to lift lit faces above
 * shaded ones; rock is a warm grey-brown, not the near-black it used to be,
 * because a north face in shade still has to read as stone and not as a hole.
 */
export const PALETTE = {
  meadow: lin(0x8c9868),
  forest: lin(0x4f6142),
  alpine: lin(0x9a9b86),
  snow: lin(0xe8eef6),
  glacier: lin(0xd2e2f2),
  scree: lin(0x9a8f80),
  rock: lin(0x75685d),
  darkRock: lin(0x564c45),
  village: lin(0xb3a488),
  water: lin(0x86aec6),
  ice: lin(0xdbe7f1),
  /** A conifer stand under snow, seen from above: dark, a little frosted. */
  snowyForest: lin(0x5d6d5c),
};

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mixInto(out: Rgb, b: Rgb, t: number) {
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
}

/** Metres of blend either side of the simulation's snow line. */
const SNOW_FEATHER = 130;

/**
 * Albedo at one point.
 *
 * `elevM` is in gameplay metres; `offset` turns it into the real height
 * (gameplay = real + offset, see config/regions.ts), which decides what grows
 * and where the ice is — so Flims, with its village at 1'080 m, is green with
 * forest far up its slopes, while St. Moritz at 1'822 m has only a thin belt
 * before the open alpine ground. Snow follows the simulation's snow line in
 * gameplay metres, so the map never contradicts the HUD.
 *
 * `slope` is a real tangent, `villageDist` in world units, `patch` a 0…1
 * noise that breaks the forest into stands.
 */
export function groundAlbedo(
  elevM: number,
  slope: number,
  snowLineM: number,
  villageDist: number,
  water: boolean,
  out: Rgb = [0, 0, 0],
  offset = 0,
  patch = 0.5,
): Rgb {
  const real = elevM - offset;
  const cover = smoothstep(snowLineM - SNOW_FEATHER, snowLineM + SNOW_FEATHER, elevM);
  if (water) {
    // Open water in summer, frozen and snowed over in winter, as the lakes of the Engadin are.
    out[0] = PALETTE.water[0];
    out[1] = PALETTE.water[1];
    out[2] = PALETTE.water[2];
    mixInto(out, PALETTE.ice, cover * 0.9);
    return out;
  }
  out[0] = PALETTE.meadow[0];
  out[1] = PALETTE.meadow[1];
  out[2] = PALETTE.meadow[2];

  // Above the tree line: alpine grass and heath, then scree.
  mixInto(out, PALETTE.alpine, smoothstep(LANDSCAPE.treeLine, LANDSCAPE.treeLine + 260, real));

  // The forest belt: below the tree line, on slopes a forest holds to (the
  // valley floor is meadow and village), in stands rather than a carpet.
  const belt = 1 - smoothstep(LANDSCAPE.treeLine - 180, LANDSCAPE.treeLine + 30, real);
  const growable = smoothstep(0.05, 0.16, slope) * (1 - smoothstep(0.62, 0.85, slope));
  const stands = smoothstep(0.32, 0.58, patch);
  const forest = belt * growable * stands * smoothstep(4, 9, villageDist);
  mixInto(out, PALETTE.forest, forest);

  // Snow holds on anything a skier could stand on and slides off the rest.
  // Under trees it only frosts the crowns, so a forest stays dark in winter.
  const holds = 1 - smoothstep(0.75, 1.05, slope);
  mixInto(out, PALETTE.snow, cover * holds * (1 - forest * 0.85));
  mixInto(out, PALETTE.snowyForest, cover * forest * 0.35);

  // Glaciers: high and not too steep.
  const ice =
    smoothstep(LANDSCAPE.glacierFrom - 80, LANDSCAPE.glacierFrom + 160, real) *
    (1 - smoothstep(LANDSCAPE.glacierMaxSlope - 0.15, LANDSCAPE.glacierMaxSlope + 0.1, slope));
  mixInto(out, PALETTE.glacier, ice);

  // Steep ground: scree, then rock, darker the higher and steeper it gets.
  mixInto(out, PALETTE.scree, smoothstep(0.72, 0.95, slope) * 0.7);
  mixInto(out, PALETTE.rock, smoothstep(0.9, 1.25, slope));
  mixInto(out, PALETTE.darkRock, smoothstep(1.1, 1.7, slope) * smoothstep(2600, 3600, real));

  // Settled ground around the village.
  const settled = (1 - smoothstep(6, 16, villageDist)) * (1 - smoothstep(0.1, 0.3, slope)) * 0.55;
  mixInto(out, PALETTE.village, settled * (1 - cover * 0.6));
  return out;
}

/**
 * Sky visibility from curvature, per DEM grid vertex.
 *
 * Real ambient occlusion needs a horizon search per vertex. Comparing a point
 * with the mean of two rings around it gets most of the look for 16 samples:
 * a gully sits below its surroundings and sees less sky, a ridge sits above
 * and sees more. The larger ring catches valley floors; the smaller one the
 * couloirs and ribs that give a face its texture.
 *
 * Returns values around 0.55 (deep gully) to 1.1 (sharp ridge).
 */
export function bakeOcclusion(elev: Float32Array, n: number, metresPerCell: number): Float32Array {
  const out = new Float32Array(n * n);
  const at = (ix: number, iz: number) => {
    const x = ix < 0 ? 0 : ix >= n ? n - 1 : ix;
    const z = iz < 0 ? 0 : iz >= n ? n - 1 : iz;
    return elev[z * n + x]!;
  };
  // Eight directions; the diagonal ones scaled so both rings are round.
  const dirs = [
    [1, 0],
    [0.7071, 0.7071],
    [0, 1],
    [-0.7071, 0.7071],
    [-1, 0],
    [-0.7071, -0.7071],
    [0, -1],
    [0.7071, -0.7071],
  ] as const;
  const rings = [
    { r: 2, weight: 0.55 },
    { r: 6, weight: 0.45 },
  ];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const h = elev[iz * n + ix]!;
      let concave = 0;
      for (const ring of rings) {
        let sum = 0;
        for (const [dx, dz] of dirs) sum += at(ix + Math.round(dx * ring.r), iz + Math.round(dz * ring.r));
        const mean = sum / dirs.length;
        // Height above or below the ring, as a gradient so radius does not
        // bias it: metres of depth per metre of distance.
        concave += ((mean - h) / (ring.r * metresPerCell)) * ring.weight;
      }
      // A gully of 0.25 (about 14 degrees deep relative to its rims) is about
      // as dark as it should get; ridges brighten less than gullies darken.
      const ao = concave > 0 ? 1 - Math.min(0.45, concave * 1.8) : 1 + Math.min(0.1, -concave * 0.6);
      out[iz * n + ix] = ao;
    }
  }
  return out;
}
