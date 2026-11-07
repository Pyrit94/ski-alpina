/**
 * What the ground is made of and how much sky it sees, baked once per vertex.
 *
 * Pure numbers over the DEM grid — no three.js, no store — so it runs in the
 * node test runner and costs nothing per frame. The renderer reads the result
 * as two vertex attributes: an albedo (`color`) and an occlusion term the
 * terrain shader applies to sky light only, so gullies sit in cool shade
 * while the sun still reaches whatever it actually hits.
 */

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
 * `slope` is a real tangent (rise over run in metres), `villageDist` in world
 * units. The snow line is the simulation's, so the map never contradicts the
 * HUD: if the run is open, the ground under it is white.
 */
export function groundAlbedo(
  elevM: number,
  slope: number,
  snowLineM: number,
  villageDist: number,
  water: boolean,
  out: Rgb = [0, 0, 0],
): Rgb {
  if (water) {
    out[0] = PALETTE.water[0];
    out[1] = PALETTE.water[1];
    out[2] = PALETTE.water[2];
    return out;
  }
  out[0] = PALETTE.meadow[0];
  out[1] = PALETTE.meadow[1];
  out[2] = PALETTE.meadow[2];
  mixInto(out, PALETTE.forest, smoothstep(1700, 1950, elevM));
  mixInto(out, PALETTE.alpine, smoothstep(2100, 2450, elevM));

  // Snow holds on anything a skier could stand on and slides off the rest.
  const cover = smoothstep(snowLineM - SNOW_FEATHER, snowLineM + SNOW_FEATHER, elevM);
  const holds = 1 - smoothstep(0.62, 0.95, slope);
  mixInto(out, PALETTE.snow, cover * holds);
  mixInto(out, PALETTE.glacier, smoothstep(3400, 3900, elevM) * (1 - smoothstep(0.3, 0.55, slope)));

  // Steep ground: scree, then rock, darker the higher and steeper it gets.
  mixInto(out, PALETTE.scree, smoothstep(0.5, 0.8, slope) * 0.8);
  mixInto(out, PALETTE.rock, smoothstep(0.75, 1.1, slope));
  mixInto(out, PALETTE.darkRock, smoothstep(1.1, 1.7, slope) * smoothstep(2600, 3600, elevM));

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
