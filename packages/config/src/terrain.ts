const WINDOW = { west: 7.62, south: 45.9, east: 7.86, north: 46.06 } as const;
const WORLD_SIZE = 196;
const METRES_PER_DEG_LAT = 110_574;
const METRES_PER_DEG_LON_EQUATOR = 111_320;

/** Ground metres one world unit covers, averaged over the window's two axes. */
const metresPerWorldUnit =
  ((WINDOW.east - WINDOW.west) *
    METRES_PER_DEG_LON_EQUATOR *
    Math.cos((((WINDOW.south + WINDOW.north) / 2) * Math.PI) / 180) +
    (WINDOW.north - WINDOW.south) * METRES_PER_DEG_LAT) /
  2 /
  WORLD_SIZE;

/** Zermatt / Matterhorn window. DEM is gameplay truth. */
export const TERRAIN = {
  ...WINDOW,
  worldSize: WORLD_SIZE,
  resolution: 160,
  minPlayElev: 1560,
  metersToWorldY: 0.0215,
  /**
   * Ground metres per world unit — about 92 for this window.
   *
   * Slope is rise over run in metres, so this is what turns an elevation
   * difference into a real gradient. Treating a world unit as ~12 m made every
   * hillside read roughly eight times too steep, which left almost the entire
   * map unbuildable: `maxSlope` values are real tangents (0.42 on a blue run is
   * about 23 degrees), so the scale has to be real too.
   */
  metresPerWorldUnit,
  seed: "copernicus-glo30-zermatt-v1",
  attribution:
    "Enthält modifizierte Copernicus-Daten (DEM GLO-30), © European Union / ESA",
} as const;

export const PEAKS = [
  { id: "matterhorn", name: "Matterhorn", elev: 4478, lat: 45.9763, lon: 7.6586, x: -46, z: -58, radius: 30, sharpness: 1.85 },
  { id: "klein", name: "Klein Matterhorn", elev: 3883, lat: 45.9384, lon: 7.7297, x: 6, z: -64, radius: 22, sharpness: 1.35 },
  { id: "breithorn", name: "Breithorn", elev: 4164, lat: 45.941, lon: 7.748, x: 34, z: -60, radius: 24, sharpness: 1.2 },
  { id: "gornergrat", name: "Gornergrat", elev: 3135, lat: 45.9836, lon: 7.7847, x: 36, z: -18, radius: 20, sharpness: 0.95 },
  { id: "rothorn", name: "Unterrothorn", elev: 3103, lat: 46.021, lon: 7.81, x: 52, z: 4, radius: 16, sharpness: 1.05 },
  { id: "riffelhorn", name: "Riffelhorn", elev: 2928, lat: 45.982, lon: 7.76, x: 14, z: -30, radius: 10, sharpness: 1.45 },
  { id: "stockhorn", name: "Stockhorn", elev: 3532, lat: 45.967, lon: 7.8, x: 48, z: -38, radius: 14, sharpness: 1.25 },
] as const;

export const RIDGES: readonly [string, string][] = [
  ["matterhorn", "klein"],
  ["klein", "breithorn"],
  ["breithorn", "stockhorn"],
  ["gornergrat", "rothorn"],
  ["riffelhorn", "gornergrat"],
  ["klein", "riffelhorn"],
];

export const VILLAGE = { name: "Zermatt Dorf", x: -4, z: 40, elev: 1608, lat: 46.0207, lon: 7.7491 } as const;
export const LAKE = { name: "Riffelsee", x: 22, z: -24, elev: 2757, radius: 9.5 } as const;
