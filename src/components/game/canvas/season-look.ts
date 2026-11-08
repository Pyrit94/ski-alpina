/**
 * What the year looks like, as numbers.
 *
 * The simulation knows three phases (winter, thaw, green season) and a snow
 * line; the eye wants four seasons. This turns the day — fractional, so the
 * look creeps through the day instead of stepping at midnight — and the
 * day's snow quality into the handful of values the renderer needs: where
 * the snow lies, how lush or golden the grass is, how far the larches have
 * turned.
 *
 * Pure numbers, no three.js and no store, so it runs in the node test runner.
 * Everything here is visual: the gameplay snow line stays the one in
 * engine/season.ts, and the runs follow that one (see piste-mesh.ts).
 */

import { SEASON } from "../../../../packages/config/src/economy.ts";
import { naturalSnowLine, seasonPhase } from "../../../../packages/shared/src/engine/season.ts";

export type VisualSeason = "winter" | "spring" | "summer" | "autumn";

/**
 * Where autumn starts, as a share of the year. The simulation has one green
 * season; the second half of it is shown as autumn, ending in the first snow.
 */
export const AUTUMN_FROM = 0.91;

/** Snow line for the eye in deep winter, gameplay metres: below every valley floor on every map. */
const WINTER_LINE_M = 900;

/**
 * The summer snow line in real metres: roughly the firn line of the northern
 * Alps, so in July only glaciers and the high peaks stay white.
 */
const SUMMER_LINE_REAL_M = 3150;

/**
 * Share of the thaw over which the eye's line catches up with the
 * simulation's. The simulation's winter line (1500 m) sits just under the
 * villages, which would leave the valley floor half green in deep winter.
 */
const THAW_CATCH_UP = 0.35;

/**
 * Share of the weather's swing the ground shows. A stormy day lifts the
 * simulation's line by up to 300 m; repainting the whole valley for one day
 * of weather would read as flicker, not weather.
 */
const WEATHER_SHARE = 0.35;

export interface SeasonLook {
  season: VisualSeason;
  /** Where the snow lies for the eye, gameplay metres. */
  snowLineM: number;
  /** 0..1: golden-brown grass, rust-red heath, yellow larches. */
  autumn: number;
  /**
   * 0..1: pale, withered grass — just melted out in spring, or dead after
   * the first frosts in late autumn. Also the bare larches of winter.
   */
  straw: number;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Position in the year, 0 on the first morning, approaching 1 at the last midnight. */
export function yearShare(day: number): number {
  const n = SEASON.daysPerYear;
  const d = (((day - 1) % n) + n) % n;
  return d / n;
}

/** The four seasons over one year share. */
export function visualSeasonAt(t: number): VisualSeason {
  if (t < SEASON.winterShare) return "winter";
  if (t < SEASON.winterShare + SEASON.springShare) return "spring";
  if (t < AUTUMN_FROM) return "summer";
  return "autumn";
}

/** The season a day belongs to (whole days, as the HUD counts them). */
export function visualSeason(day: number): VisualSeason {
  return visualSeasonAt(yearShare(Math.floor(day)));
}

/** The eye's snow line before the weather, gameplay metres. Continuous over the whole year, the wrap included. */
function baseSnowLine(day: number, t: number, summerLine: number): number {
  const thawFrom = SEASON.winterShare;
  const greenFrom = SEASON.winterShare + SEASON.springShare;
  if (t < thawFrom) return WINTER_LINE_M;
  if (t < greenFrom) {
    const s = (t - thawFrom) / SEASON.springShare;
    const sim = naturalSnowLine(day);
    // The eye starts lower, catches up with the simulation within the first
    // third of the thaw, and stops at the firn line.
    const line = WINTER_LINE_M + (sim - WINTER_LINE_M) * smoothstep(0, THAW_CATCH_UP, s);
    return Math.min(line, summerLine);
  }
  if (t < AUTUMN_FROM) return summerLine;
  // Autumn: the snow holds off at first, then creeps down the mountain and
  // reaches the valley on the last day, where winter takes over.
  const a = (t - AUTUMN_FROM) / (1 - AUTUMN_FROM);
  return summerLine + (WINTER_LINE_M - summerLine) * smoothstep(0.3, 1, a);
}

/**
 * The look of one moment of the year.
 *
 * `day` may be fractional (day + time of day). `snowQuality` is today's
 * weather (0..1, see engine/weather.ts); `offsetM` is the map's gameplay
 * minus real metres (config/regions.ts), which decides how high the summer
 * snow sits on this map.
 */
export function seasonLook(day: number, snowQuality: number, offsetM: number): SeasonLook {
  const t = yearShare(day);
  const summerLine = Math.min(SEASON.summerSnowLine, SUMMER_LINE_REAL_M + offsetM);
  const q = Math.min(1, Math.max(0, snowQuality));
  const weather = (1 - q) * SEASON.weatherSwingMetres * WEATHER_SHARE;
  const snowLineM = baseSnowLine(day, t, summerLine) + weather;

  const thawFrom = SEASON.winterShare;
  let autumn = 0;
  let straw = 1;
  if (t >= thawFrom && t < AUTUMN_FROM) {
    // Meadows melt out pale and green up over the thaw.
    const s = Math.min(1, (t - thawFrom) / SEASON.springShare);
    straw = 1 - smoothstep(0.25, 0.85, s);
  } else if (t >= AUTUMN_FROM) {
    const a = (t - AUTUMN_FROM) / (1 - AUTUMN_FROM);
    // Gold first, then the frost takes the colour out of it, and the larches
    // stand bare by the time the snow arrives — as they do in winter.
    autumn = smoothstep(0, 0.35, a) * (1 - smoothstep(0.7, 1, a));
    straw = smoothstep(0.6, 1, a);
  }
  return { season: visualSeasonAt(t), snowLineM, autumn, straw };
}

/** How much snow lies at `elevM` (gameplay metres) for a given line, 0..1. Same feather as the ground. */
export function snowCoverAt(elevM: number, snowLineM: number, featherM = 130): number {
  return smoothstep(snowLineM - featherM, snowLineM + featherM, elevM);
}

/**
 * Quantised, so a renderer repaints only when something visible changed: the
 * snow line in 25 m steps (below what the eye catches on a 130 m blend), the
 * tints in twentieths.
 */
export function quantiseLook(look: SeasonLook): SeasonLook {
  return {
    season: look.season,
    snowLineM: Math.round(look.snowLineM / 25) * 25,
    autumn: Math.round(look.autumn * 20) / 20,
    straw: Math.round(look.straw * 20) / 20,
  };
}

/** Whether skiing is over: the simulation's green season (no skiers, idle cannons, no grooming). */
export function isGreenSeason(day: number): boolean {
  return seasonPhase(Math.floor(day)) === "summer";
}

export const VISUAL_SEASON_LABEL: Record<VisualSeason, string> = {
  winter: "Winter",
  spring: "Frühling",
  summer: "Sommer",
  autumn: "Herbst",
};

/** The HUD's season line: «Winter · Tag 34». */
export function seasonLabel(day: number): string {
  return `${VISUAL_SEASON_LABEL[visualSeason(day)]} · Tag ${Math.floor(day)}`;
}

/** One line for Betrieb: what this season means for the guests. */
export function seasonGuestNote(day: number): string {
  switch (visualSeason(day)) {
    case "winter":
      return "Hochsaison: Die Gäste kommen zum Skifahren, jede offene Piste zählt.";
    case "spring":
      return "Der Schnee zieht sich nach oben zurück: tiefe Pisten schliessen, Beschneiung hält sie länger offen.";
    case "summer":
      return "Skigäste nur noch auf Gletscherpisten. Geld bringen Bahnen, die auch talwärts fahren, und Sommerattraktionen.";
    case "autumn":
      return "Zwischensaison: Wie im Sommer zählen Bahnen mit Talfahrt und Sommerattraktionen, bis der Winter kommt.";
  }
}
