import { SEASON } from "../../../config/src/economy.ts";

export type SeasonPhase = "winter" | "spring" | "summer";

/** Position in the year, 0 on the first day and approaching 1 on the last. */
function yearProgress(day: number): number {
  const d = ((day - 1) % SEASON.daysPerYear + SEASON.daysPerYear) % SEASON.daysPerYear;
  return d / SEASON.daysPerYear;
}

export function seasonPhase(day: number): SeasonPhase {
  const t = yearProgress(day);
  if (t < SEASON.winterShare) return "winter";
  if (t < SEASON.winterShare + SEASON.springShare) return "spring";
  return "summer";
}

/**
 * The natural snow line in metres, before any snowmaking.
 *
 * Flat through winter, climbing through the thaw, and above the whole resort
 * once it is green. Expressed in shares of the year so shortening the calendar
 * does not silently move the seasons.
 */
export function naturalSnowLine(day: number): number {
  const t = yearProgress(day);
  const thawEnd = SEASON.winterShare + SEASON.springShare;
  if (t < SEASON.winterShare) return SEASON.winterSnowLine;
  if (t >= thawEnd) return SEASON.summerSnowLine;
  const through = (t - SEASON.winterShare) / SEASON.springShare;
  return SEASON.winterSnowLine + (SEASON.summerSnowLine - SEASON.winterSnowLine) * through;
}

/**
 * The snow line the resort actually operates against.
 *
 * Poor snow quality lifts it, cannons push it back down — but only so far, so
 * snowmaking buys a low resort a few weeks rather than a whole summer.
 */
export function snowLine(day: number, snowQuality: number, snowmakers: number): number {
  const weather = (1 - Math.max(0, Math.min(1, snowQuality))) * SEASON.weatherSwingMetres;
  const made = Math.min(snowmakers * SEASON.snowmakerDrop, SEASON.maxSnowmakerDrop);
  return naturalSnowLine(day) + weather - made;
}

/**
 * How much of a run is still skiable, 0..1.
 *
 * Keyed on the bottom of the run, which is the end that goes bare first. A run
 * entirely above the line is untouched; one far below it closes.
 */
export function pisteSnowScale(bottomElevation: number, line: number): number {
  const deficit = line - bottomElevation;
  if (deficit <= 0) return 1;
  if (deficit >= SEASON.fadeMetres) return 0;
  return 1 - deficit / SEASON.fadeMetres;
}

/** Share of winter demand that still turns up in this part of the year. */
export function seasonDemandShare(day: number): number {
  const t = yearProgress(day);
  const thawEnd = SEASON.winterShare + SEASON.springShare;
  if (t < SEASON.winterShare) return 1;
  if (t >= thawEnd) return SEASON.summerDemandShare;
  const through = (t - SEASON.winterShare) / SEASON.springShare;
  return 1 + (SEASON.summerDemandShare - 1) * through;
}

export const SEASON_LABEL: Record<SeasonPhase, string> = {
  winter: "Winter",
  spring: "Schneeschmelze",
  summer: "Sommerbetrieb",
};
