import type { WeatherKind, WeatherState } from "../types.ts";
import { seasonPhase } from "./season.ts";

/**
 * Deterministic 0..1 draw from a pair of integers.
 *
 * The sim is authoritative and shared, so the sky has to be reproducible: two
 * clients on the same day must not disagree about the snow, and reloading a
 * room must not reroll it. A hash of (season, day, salt) gives that for free,
 * with no state to persist.
 */
function draw(season: number, day: number, salt: number): number {
  let h = (season * 73_856_093) ^ (day * 19_349_663) ^ (salt * 83_492_791);
  h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
  h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

const WINTER: { kind: WeatherKind; upTo: number; label: string; snow: number; temp: number }[] = [
  // Ordered bands over one roll, so every kind is actually reachable. The old
  // client-side version tested `roll > 0.97` after `roll > 0.82`, which meant
  // storms could never occur at all.
  { kind: "snow", upTo: 0.3, label: "Schneefall", snow: 0.97, temp: -8 },
  { kind: "sun", upTo: 0.58, label: "Sonnig, Pulver", snow: 0.88, temp: -6 },
  { kind: "cloud", upTo: 0.8, label: "Bewoelkt", snow: 0.8, temp: -5 },
  { kind: "fog", upTo: 0.92, label: "Hochnebel", snow: 0.7, temp: -3 },
  { kind: "storm", upTo: 1, label: "Sturm", snow: 0.52, temp: -12 },
];

const GREEN: { kind: WeatherKind; upTo: number; label: string; snow: number; temp: number }[] = [
  { kind: "sun", upTo: 0.55, label: "Sonnig und warm", snow: 0.2, temp: 16 },
  { kind: "cloud", upTo: 0.85, label: "Bewoelkt", snow: 0.22, temp: 11 },
  { kind: "storm", upTo: 1, label: "Gewitter", snow: 0.18, temp: 9 },
];

/**
 * The weather for one day of one season.
 *
 * Winter draws from the alpine band, the green season from a summer one, and
 * the thaw sits between the two — which is what makes snowmaking worth having
 * in spring and pointless in July.
 */
export function weatherForDay(season: number, day: number): WeatherState {
  const phase = seasonPhase(day);
  const table = phase === "summer" ? GREEN : WINTER;
  const roll = draw(season, day, 1);
  const band = table.find((b) => roll <= b.upTo) ?? table[table.length - 1]!;
  // A degree or two of jitter so consecutive days of the same kind still differ.
  const jitter = Math.round((draw(season, day, 2) - 0.5) * 4);
  const thawing = phase === "spring";
  return {
    kind: band.kind,
    tempC: band.temp + jitter + (thawing ? 5 : 0),
    snowQuality: Math.max(0, Math.min(1, thawing ? band.snow - 0.22 : band.snow)),
    live: false,
    label: band.label,
  };
}
