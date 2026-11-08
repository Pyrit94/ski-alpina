/**
 * Light and air by time of day.
 *
 * A game day is 90 real seconds, so whatever the sun does it does constantly
 * and in plain view. Everything here is a handful of keyframes and a lerp:
 * no allocation, no three.js, cheap enough to run every frame and simple
 * enough to test without a renderer.
 *
 * World axes, as the DEM lays them out: +x is east, +z is north (the village
 * sits north of the Matterhorn). The sun is not astronomically placed. The
 * opening camera looks south across the village at the peaks, and a true
 * southern sun would put every face the player sees in its own shadow all
 * day. Instead it rises in the east, swings round *behind* the viewer at an
 * angle, and sets in the west — the cross-light a relief map uses, which is
 * what makes slopes read as slopes.
 */

export type Rgb = [number, number, number];

export interface Atmosphere {
  /** Unit vector from the ground toward the light. */
  sunDir: [number, number, number];
  sunColor: Rgb;
  /** Relative to the tier's sun at noon. */
  sunIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  /** Relative to the tier's hemisphere fill at noon. */
  hemiIntensity: number;
  zenith: Rgb;
  horizon: Rgb;
  fog: Rgb;
  /** 0 by day, 1 at full night. */
  night: number;
}

interface Key {
  t: number;
  sun: Rgb;
  sunI: number;
  sky: Rgb;
  ground: Rgb;
  hemiI: number;
  zenith: Rgb;
  horizon: Rgb;
  fog: Rgb;
}

const hex = (h: number): Rgb => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

const NIGHT: Omit<Key, "t"> = {
  sun: hex(0xa9bde6),
  sunI: 0.42,
  sky: hex(0x6f88b8),
  ground: hex(0x4a5a78),
  hemiI: 0.9,
  zenith: hex(0x0d1a33),
  horizon: hex(0x2c4166),
  fog: hex(0x304668),
};

/**
 * The day, keyed on `timeOfDay` (0 = midnight).
 *
 * Night is held bright enough to build in: this is a game that runs a full
 * day every minute and a half, and half of it pitch black is half the game
 * unplayable.
 */
const KEYS: Key[] = [
  { t: 0, ...NIGHT },
  { t: 0.205, ...NIGHT },
  {
    t: 0.25,
    sun: hex(0xff9a66),
    sunI: 0.55,
    sky: hex(0x8aa2cc),
    ground: hex(0x8f8a9e),
    hemiI: 0.8,
    zenith: hex(0x3c5d93),
    horizon: hex(0xf2b48c),
    fog: hex(0xb8a8b8),
  },
  {
    t: 0.31,
    sun: hex(0xffd2a1),
    sunI: 0.88,
    sky: hex(0x9cc0ec),
    ground: hex(0xb6c2d2),
    hemiI: 0.95,
    zenith: hex(0x3f72b8),
    horizon: hex(0xd9d6d4),
    fog: hex(0xaec3d8),
  },
  {
    t: 0.42,
    sun: hex(0xfff1dc),
    sunI: 1,
    sky: hex(0x9cc4f2),
    ground: hex(0xb8c8da),
    hemiI: 1,
    zenith: hex(0x3a6fb5),
    horizon: hex(0xc4d8ec),
    fog: hex(0xa4c0dc),
  },
  {
    t: 0.58,
    sun: hex(0xfff1dc),
    sunI: 1,
    sky: hex(0x9cc4f2),
    ground: hex(0xb8c8da),
    hemiI: 1,
    zenith: hex(0x3a6fb5),
    horizon: hex(0xc4d8ec),
    fog: hex(0xa4c0dc),
  },
  {
    t: 0.68,
    sun: hex(0xffc47e),
    sunI: 0.92,
    sky: hex(0x9ab6e2),
    ground: hex(0xc2b8ae),
    hemiI: 0.92,
    zenith: hex(0x3d68aa),
    horizon: hex(0xeccaa0),
    fog: hex(0xb9bccb),
  },
  {
    t: 0.75,
    sun: hex(0xff8752),
    sunI: 0.55,
    sky: hex(0x7c8fc0),
    ground: hex(0x8c7c88),
    hemiI: 0.8,
    zenith: hex(0x2c477e),
    horizon: hex(0xe8936a),
    fog: hex(0xa48f9e),
  },
  { t: 0.8, ...NIGHT },
  { t: 1, ...NIGHT },
];

const DAWN = 0.23;
const DUSK = 0.77;
/** The lowest the sun is drawn, in radians. A sun on the horizon blacks out every west face. */
const MIN_ELEV = 0.11;
const MAX_ELEV = 0.86;
/** Azimuth sweep, measured from +x (east) through +z (behind the opening camera). */
const AZ_RISE = 0.18 * Math.PI;
const AZ_SET = 1.02 * Math.PI;
/** The moon: high, behind the camera, slightly west. Fixed, so night shadows hold still. */
const MOON: [number, number, number] = norm([-0.35, 0.8, 0.5]);

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpRgb(out: Rgb, a: Rgb, b: Rgb, t: number) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

export function createAtmosphere(): Atmosphere {
  return {
    sunDir: [0, 1, 0],
    sunColor: [1, 1, 1],
    sunIntensity: 1,
    hemiSky: [1, 1, 1],
    hemiGround: [1, 1, 1],
    hemiIntensity: 1,
    zenith: [0, 0, 1],
    horizon: [1, 1, 1],
    fog: [1, 1, 1],
    night: 0,
  };
}

/**
 * Fill `out` for a given time of day. Writes in place so a frame loop can
 * call it without producing garbage.
 */
export function atmosphereAt(tod: number, out: Atmosphere = createAtmosphere()): Atmosphere {
  const t = ((tod % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.t <= t) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  // Smoothstep between keys, so the light eases rather than kinks.
  const s = k * k * (3 - 2 * k);

  lerpRgb(out.sunColor, a.sun, b.sun, s);
  lerpRgb(out.hemiSky, a.sky, b.sky, s);
  lerpRgb(out.hemiGround, a.ground, b.ground, s);
  lerpRgb(out.zenith, a.zenith, b.zenith, s);
  lerpRgb(out.horizon, a.horizon, b.horizon, s);
  lerpRgb(out.fog, a.fog, b.fog, s);
  out.sunIntensity = lerp(a.sunI, b.sunI, s);
  out.hemiIntensity = lerp(a.hemiI, b.hemiI, s);

  // Sun path: up in the east, round behind the viewer, down in the west.
  const u = Math.min(1, Math.max(0, (t - DAWN) / (DUSK - DAWN)));
  const elev = MIN_ELEV + (MAX_ELEV - MIN_ELEV) * Math.sin(Math.PI * u);
  const az = lerp(AZ_RISE, AZ_SET, u);
  const ce = Math.cos(elev);
  const sx = Math.cos(az) * ce;
  const sy = Math.sin(elev);
  const sz = Math.sin(az) * ce;

  // Hand over to the moon through twilight rather than snapping.
  const day = t < 0.5 ? (t - 0.2) / (0.26 - 0.2) : (0.8 - t) / (0.8 - 0.74);
  const sun = Math.min(1, Math.max(0, day));
  out.night = 1 - sun;
  const dx = lerp(MOON[0], sx, sun);
  const dy = lerp(MOON[1], sy, sun);
  const dz = lerp(MOON[2], sz, sun);
  const l = Math.hypot(dx, dy, dz) || 1;
  out.sunDir[0] = dx / l;
  out.sunDir[1] = dy / l;
  out.sunDir[2] = dz / l;
  return out;
}

/**
 * What the weather does to the light, on top of the time of day.
 *
 * `overcast` pulls sky and horizon toward the cloud colour, `sun` and `fill`
 * scale the direct and sky light, and `haze` brings the fog in (1 = the
 * tier's fair-weather distance, smaller = closer). The sim decides the
 * weather; this only makes it visible.
 */
export interface WeatherLook {
  overcast: number;
  sun: number;
  fill: number;
  haze: number;
}

export const WEATHER_LOOK: Record<"sun" | "cloud" | "snow" | "fog" | "storm", WeatherLook> = {
  sun: { overcast: 0, sun: 1, fill: 1, haze: 1 },
  cloud: { overcast: 0.55, sun: 0.62, fill: 1.05, haze: 0.85 },
  snow: { overcast: 0.8, sun: 0.4, fill: 1.08, haze: 0.45 },
  fog: { overcast: 0.7, sun: 0.48, fill: 1.1, haze: 0.22 },
  storm: { overcast: 0.92, sun: 0.26, fill: 0.9, haze: 0.42 },
};

/** Ease `look` toward `target` by `k` (0..1), in place. */
export function easeWeather(look: WeatherLook, target: WeatherLook, k: number): WeatherLook {
  look.overcast = lerp(look.overcast, target.overcast, k);
  look.sun = lerp(look.sun, target.sun, k);
  look.fill = lerp(look.fill, target.fill, k);
  look.haze = lerp(look.haze, target.haze, k);
  return look;
}

/**
 * Lay the weather over a time-of-day atmosphere, in place.
 *
 * Cloud is a grey whose brightness follows the daylight, so an overcast
 * evening goes dark instead of staying a flat mid-grey.
 */
export function applyWeather(out: Atmosphere, look: WeatherLook): Atmosphere {
  const bright = 0.42 + 0.4 * (1 - out.night);
  const cloud: Rgb = [bright * 0.94, bright * 0.97, bright];
  lerpRgb(out.zenith, out.zenith, cloud, look.overcast);
  lerpRgb(out.horizon, out.horizon, [cloud[0] * 1.08, cloud[1] * 1.08, cloud[2] * 1.08], look.overcast * 0.9);
  lerpRgb(out.fog, out.fog, [cloud[0] * 1.06, cloud[1] * 1.06, cloud[2] * 1.06], look.overcast * 0.85);
  // Under cloud the sun loses its colour before it loses its strength.
  lerpRgb(out.sunColor, out.sunColor, [0.92, 0.94, 0.98], look.overcast * 0.7);
  out.sunIntensity *= look.sun;
  out.hemiIntensity *= look.fill;
  return out;
}
