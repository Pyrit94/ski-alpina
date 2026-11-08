/**
 * Where a resort can be built: real ski areas, real ground.
 *
 * Every region is the same size of window — `TERRAIN.worldSize` world units of
 * about 92 m each, some 18 km square — centred on `center`, so a hex, a slope
 * and a lift span mean the same everywhere. The elevations come from
 * Copernicus/SRTM via the AWS Terrain Tiles and are baked into
 * packages/shared/src/terrain/regions/ by `scripts/build-regions.mjs`.
 *
 * Gameplay heights are normalised: each region is lifted or lowered so its
 * village sits at `VILLAGE_GAME_ELEV`. That keeps every elevation rule — snow
 * line, where a hotel may stand, how high a glacier lift must start —
 * meaning the same in Flims (1'080 m) as in Saas-Fee (1'800 m). Heights
 * shown to the players are converted back to the real ones.
 */

export interface RegionPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface RegionDef {
  id: string;
  name: string;
  /** Canton or country, for the picker. */
  area: string;
  /** One line for the picker card. */
  blurb: string;
  /** Centre of the 18 km window. */
  center: { lat: number; lon: number };
  village: RegionPlace;
  /** Labelled on the map. */
  peaks: RegionPlace[];
}

/** Where every region's village lands in gameplay metres. */
export const VILLAGE_GAME_ELEV = 1600;

/** Edge of the play window, in kilometres: worldSize × metres per world unit. */
export const REGION_WINDOW_KM = 18.03;

/**
 * The overview map of the picker (public/regions/alpen.png): equirectangular,
 * so a region's marker sits at its longitude and latitude, linearly.
 */
export const ALPS_MAP = { west: 6.4, east: 10.8, south: 45.7, north: 47.35 } as const;

/** The far land around the play window, for the horizon: this many km square. */
export const REGION_FAR_KM = 90;

export const REGIONS: RegionDef[] = [
  {
    id: "zermatt",
    name: "Zermatt",
    area: "Wallis",
    blurb: "Unter dem Matterhorn: Gornergrat, Sunnegga und Gletscher bis über 3'800 m.",
    center: { lat: 45.995, lon: 7.755 },
    village: { name: "Zermatt", lat: 46.0207, lon: 7.7491 },
    peaks: [
      { name: "Matterhorn", lat: 45.9763, lon: 7.6586 },
      { name: "Gornergrat", lat: 45.9836, lon: 7.7847 },
      { name: "Unterrothorn", lat: 46.0215, lon: 7.8101 },
      { name: "Riffelhorn", lat: 45.982, lon: 7.76 },
      { name: "Klein Matterhorn", lat: 45.9384, lon: 7.7297 },
    ],
  },
  {
    id: "flims-laax",
    name: "Flims Laax",
    area: "Graubünden",
    blurb: "Weite Hänge über dem Rheintal, vom Dorf bis auf den Vorab-Gletscher.",
    center: { lat: 46.85, lon: 9.235 },
    village: { name: "Flims", lat: 46.8355, lon: 9.2846 },
    peaks: [
      { name: "Vorab", lat: 46.879, lon: 9.173 },
      { name: "Crap Sogn Gion", lat: 46.854, lon: 9.229 },
      { name: "Cassons", lat: 46.866, lon: 9.279 },
      { name: "Crap Masegn", lat: 46.8655, lon: 9.2015 },
    ],
  },
  {
    id: "st-moritz",
    name: "St. Moritz",
    area: "Graubünden",
    blurb: "Engadiner Sonne: Corviglia über dem See, Corvatsch gegenüber.",
    center: { lat: 46.475, lon: 9.82 },
    village: { name: "St. Moritz", lat: 46.4975, lon: 9.839 },
    peaks: [
      { name: "Piz Nair", lat: 46.525, lon: 9.801 },
      { name: "Corviglia", lat: 46.516, lon: 9.81 },
      { name: "Corvatsch", lat: 46.418, lon: 9.821 },
    ],
  },
  {
    id: "davos",
    name: "Davos Klosters",
    area: "Graubünden",
    blurb: "Breites Hochtal mit zwei Seiten: Parsenn und Jakobshorn.",
    center: { lat: 46.805, lon: 9.83 },
    village: { name: "Davos", lat: 46.796, lon: 9.823 },
    peaks: [
      { name: "Weissfluh", lat: 46.8355, lon: 9.7955 },
      { name: "Jakobshorn", lat: 46.772, lon: 9.85 },
      { name: "Pischa", lat: 46.8215, lon: 9.893 },
    ],
  },
  {
    id: "arosa",
    name: "Arosa",
    area: "Graubünden",
    blurb: "Sonniger Talkessel am Ende des Schanfigg, alles in Reichweite.",
    center: { lat: 46.782, lon: 9.66 },
    village: { name: "Arosa", lat: 46.779, lon: 9.679 },
    peaks: [
      { name: "Weisshorn", lat: 46.797, lon: 9.643 },
      { name: "Hörnli", lat: 46.76, lon: 9.645 },
      { name: "Aroser Rothorn", lat: 46.7395, lon: 9.6315 },
    ],
  },
  {
    id: "verbier",
    name: "Verbier",
    area: "Wallis",
    blurb: "Sonnenterrasse über dem Val de Bagnes, steil hinauf zum Mont Fort.",
    center: { lat: 46.095, lon: 7.265 },
    village: { name: "Verbier", lat: 46.096, lon: 7.228 },
    peaks: [
      { name: "Mont Fort", lat: 46.0835, lon: 7.311 },
      { name: "Les Attelas", lat: 46.0985, lon: 7.27 },
      { name: "Savoleyres", lat: 46.117, lon: 7.214 },
    ],
  },
  {
    id: "saas-fee",
    name: "Saas-Fee",
    area: "Wallis",
    blurb: "Gletscherdorf auf 1'800 m, ringsum Viertausender.",
    center: { lat: 46.09, lon: 7.93 },
    village: { name: "Saas-Fee", lat: 46.108, lon: 7.927 },
    peaks: [
      { name: "Allalinhorn", lat: 46.0465, lon: 7.8945 },
      { name: "Mittelallalin", lat: 46.067, lon: 7.92 },
      { name: "Plattjen", lat: 46.096, lon: 7.954 },
    ],
  },
  {
    id: "engelberg",
    name: "Engelberg Titlis",
    area: "Obwalden",
    blurb: "Vom Klosterdorf auf 1'000 m bis auf den Titlis-Gletscher.",
    center: { lat: 46.8, lon: 8.41 },
    village: { name: "Engelberg", lat: 46.821, lon: 8.401 },
    peaks: [
      { name: "Titlis", lat: 46.772, lon: 8.437 },
      { name: "Graustock", lat: 46.7865, lon: 8.3605 },
      { name: "Brunni", lat: 46.838, lon: 8.42 },
    ],
  },
  {
    id: "grindelwald",
    name: "Grindelwald",
    area: "Bern",
    blurb: "Unter Eiger, Mönch und Jungfrau: First, Männlichen, Kleine Scheidegg.",
    center: { lat: 46.61, lon: 8.0 },
    village: { name: "Grindelwald", lat: 46.624, lon: 8.041 },
    peaks: [
      { name: "Eiger", lat: 46.5776, lon: 8.0053 },
      { name: "First", lat: 46.659, lon: 8.054 },
      { name: "Männlichen", lat: 46.613, lon: 7.941 },
    ],
  },
  {
    id: "andermatt",
    name: "Andermatt",
    area: "Uri",
    blurb: "Hochtal am Gotthard, schneesicher, mit dem steilen Gemsstock.",
    center: { lat: 46.625, lon: 8.61 },
    village: { name: "Andermatt", lat: 46.6355, lon: 8.5938 },
    peaks: [
      { name: "Gemsstock", lat: 46.602, lon: 8.611 },
      { name: "Nätschen", lat: 46.6385, lon: 8.6315 },
    ],
  },
  {
    id: "st-anton",
    name: "St. Anton",
    area: "Tirol",
    blurb: "Arlberg: tiefes Tal, steile Flanken, Valluga über allem.",
    center: { lat: 47.15, lon: 10.25 },
    village: { name: "St. Anton", lat: 47.129, lon: 10.268 },
    peaks: [
      { name: "Valluga", lat: 47.158, lon: 10.214 },
      { name: "Galzig", lat: 47.141, lon: 10.236 },
      { name: "Rendl", lat: 47.118, lon: 10.236 },
    ],
  },
  {
    id: "chamonix",
    name: "Chamonix",
    area: "Haute-Savoie",
    blurb: "Tiefes Tal unter dem Mont Blanc, Hänge bis ins Hochgebirge.",
    center: { lat: 45.93, lon: 6.88 },
    village: { name: "Chamonix", lat: 45.9237, lon: 6.8694 },
    peaks: [
      { name: "Aiguille du Midi", lat: 45.8786, lon: 6.8874 },
      { name: "Brévent", lat: 45.9346, lon: 6.8378 },
      { name: "Flégère", lat: 45.9585, lon: 6.8834 },
    ],
  },
];

export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/** The hand-made valley the game started with; old saves keep it. */
export const CLASSIC_REGION = "classic";
