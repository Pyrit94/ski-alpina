import { FLOW, PISTE_PLANNER } from "../../../config/src/economy.ts";
import type { PisteGrade } from "../../../config/src/terrain.ts";
import { hexDistance, hexesInRange, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PisteDifficulty, PlacedPiste, ResortState, SimStats } from "../types.ts";
import { goodDayJudge, overlap, rated, swingLines, type AutoMix } from "./auto-pistes.ts";
import { descentGoals, liftEnds } from "./descent.ts";
import { neighbourAvoid } from "./neighbours.ts";
import { routeToAny } from "./piste-route.ts";
import { scorePiste } from "./piste-score.ts";
import { discounted } from "./research.ts";
import { surveyPiste, validatePistePath } from "./validate.ts";

/**
 * The runs that come with a middle station: from the top to the new stop,
 * from the stop down to the valley station, and the long one from top to
 * valley. Each can be chosen on its own; the lines are picked the way the
 * piste assistant picks them — every grade asked for, plain and with swings,
 * judged by the simulation and by the run's rating.
 *
 * Nothing is placed here: each run is an ordinary `place_piste`, sent after
 * the `add_mid_station` and validated again by the server.
 */

export type StationLeg = "top-mid" | "mid-base" | "top-base";

export const STATION_LEGS: readonly StationLeg[] = ["top-mid", "mid-base", "top-base"];

export interface StationRun {
  leg: StationLeg;
  hexes: Axial[];
  grade: PisteDifficulty;
  /** CHF, research discount included. */
  cost: number;
  /** Rating 0 … 100 (see PISTE_SCORE). */
  points: number;
}

export interface StationRunsResult {
  runs: StationRun[];
  /** Legs asked for that got no run, and why. */
  missed: { leg: StationLeg; reason: "terrain" | "budget" }[];
  cost: number;
}

const GRADES: PisteGrade[] = ["blue", "red", "black"];
const key = (hexes: readonly Axial[]) => hexes.map((h) => `${h.q},${h.r}`).join(";");

/** The resort as it will be once the middle station stands at `mid`. */
export function withMidStation(state: ResortState, liftId: string, mid: Axial): ResortState {
  return { ...state, lifts: state.lifts.map((l) => (l.id === liftId ? { ...l, mid } : l)) };
}

/**
 * Which legs a lift still lacks: a run from the top that ends at the valley
 * station already counts as «Berg → Tal».
 */
export function missingLegs(state: ResortState, dem: Dem, liftId: string): StationLeg[] {
  const lift = state.lifts.find((l) => l.id === liftId);
  if (!lift) return [];
  const { top, base } = liftEnds(dem, lift);
  const near = (a: Axial, b: Axial) => hexDistance(a, b) <= FLOW.linkRadius;
  const longRun = state.pistes.some(
    (p) => p.difficulty !== "road" && p.hexes.length >= 2 && near(p.hexes[0]!, top) && near(p.hexes[p.hexes.length - 1]!, base),
  );
  return longRun ? ["top-mid", "mid-base"] : [...STATION_LEGS];
}

export function planStationRuns(
  state: ResortState,
  dem: Dem,
  liftId: string,
  mid: Axial,
  legs: readonly StationLeg[],
  opts: { mix: AutoMix; budget: number },
): StationRunsResult {
  const lift = state.lifts.find((l) => l.id === liftId);
  if (!lift) return { runs: [], missed: [], cost: 0 };
  const { top, base } = liftEnds(dem, lift);
  const grades: PisteGrade[] = opts.mix === "mixed" ? GRADES : [opts.mix];
  const judge = goodDayJudge(state, dem);
  const avoid = neighbourAvoid(state);

  let sim = withMidStation(state, liftId, mid);
  let spent = 0;
  const runs: StationRun[] = [];
  const missed: StationRunsResult["missed"] = [];

  const ends: Record<StationLeg, { from: Axial; to: Axial }> = {
    "top-mid": { from: top, to: mid },
    "mid-base": { from: mid, to: base },
    "top-base": { from: top, to: base },
  };

  for (const leg of STATION_LEGS.filter((l) => legs.includes(l))) {
    const { from, to } = ends[leg];
    const around = hexesInRange(to, 1).filter((h) => hexDistance(h, from) > FLOW.linkRadius && !avoid.has(`${h.q},${h.r}`));
    // Down to the valley: the station itself first; if the ground will not
    // lead there, anywhere a run counts as joined (the village, another run).
    const goalSets = leg === "top-mid" ? [around] : [around, descentGoals(sim, dem, from)];
    let options: StationRun[] = [];
    for (const goals of goalSets) {
      if (goals.length === 0) continue;
      const lines: (Axial[] | null)[] = [];
      for (const g of grades) {
        const plain = routeToAny(dem, from, goals, g, { avoid });
        lines.push(plain, ...swingLines(dem, from, goals, g, plain, avoid));
      }
      lines.push(routeToAny(dem, from, goals, "any", { avoid }));
      const seen = new Set<string>();
      for (const hexes of lines) {
        if (!hexes || hexes.length < 2) continue;
        const k = key(hexes);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!validatePistePath(sim, dem, "piste", hexes).ok) continue;
        const survey = surveyPiste(dem, "piste", hexes);
        if (!survey) continue;
        options.push({ leg, hexes, grade: survey.grade, cost: discounted(state, survey.cost), points: scorePiste(hexes, dem).points });
      }
      if (options.length > 0) break;
    }
    if (options.length === 0) {
      missed.push({ leg, reason: "terrain" });
      continue;
    }
    const inBudget = options.filter((o) => spent + o.cost <= opts.budget);
    if (inBudget.length === 0) {
      missed.push({ leg, reason: "budget" });
      continue;
    }
    // The grade asked for if there is one; a line that does not lie on a run
    // just chosen if there is one; then what the simulation likes best.
    const wanted = inBudget.filter((o) => grades.includes(o.grade as PisteGrade));
    options = wanted.length > 0 ? wanted : inBudget;
    const apart = options.filter((o) => overlap(o.hexes, runs) <= PISTE_PLANNER.maxOverlap);
    if (apart.length > 0) options = apart;
    let best: { run: StationRun; next: ResortState; stats: SimStats } | null = null;
    for (const run of options) {
      const piste: PlacedPiste = {
        id: `station-${leg}`,
        itemId: "piste",
        difficulty: run.grade,
        hexes: run.hexes,
        builtAt: 0,
        readyAt: 0,
        score: run.points,
      };
      const next = { ...sim, pistes: [...sim.pistes, piste] };
      const stats = judge(next);
      if (!best || rated(stats.incomePerHour, run.points) > rated(best.stats.incomePerHour, best.run.points)) {
        best = { run, next, stats };
      }
    }
    runs.push(best!.run);
    spent += best!.run.cost;
    sim = best!.next;
  }
  return { runs, missed, cost: spent };
}
