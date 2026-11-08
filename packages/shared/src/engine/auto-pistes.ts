import { hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PisteDifficulty, PlacedPiste, ResortState } from "../types.ts";
import { descentGoals, liftEnds, resortLinks } from "./descent.ts";
import type { PisteGrade } from "../../../config/src/terrain.ts";
import { routeToAny } from "./piste-route.ts";
import { discounted } from "./research.ts";
import { surveyPiste, validatePistePath } from "./validate.ts";

/**
 * «Pisten automatisch»: the runs a layout is missing, planned in one go.
 *
 * Two passes, both over the same graph and rules the simulation uses:
 * 1. Every chosen lift with no way down gets one — lowest top station first,
 *    so a higher lift's run can end on a lower lift's new run instead of
 *    running all the way to the valley.
 * 2. With "gemischt", each grade the area does not offer yet (blue, red,
 *    black) is tried from the chosen lifts' tops: variety draws guests.
 *
 * Nothing is placed here. Each plan is an ordinary `place_piste` the server
 * validates again; plans build on each other in order, so they must be sent
 * in order.
 */

export type AutoMix = "mixed" | PisteGrade;

export interface AutoPlan {
  liftId: string;
  hexes: Axial[];
  grade: PisteDifficulty;
  /** CHF, research discount included. */
  cost: number;
  why: "descent" | "variety";
}

export interface AutoResult {
  plans: AutoPlan[];
  /** Lifts that needed a run but got none, and why. */
  missed: { liftId: string; reason: "terrain" | "budget" }[];
}

const GRADES: PisteGrade[] = ["blue", "red", "black"];
/** A new run may share at most this much of its line with existing ones. */
const MAX_OVERLAP = 0.4;

export function planAutoPistes(
  state: ResortState,
  dem: Dem,
  opts: { liftIds?: readonly string[]; mix: AutoMix; budget: number },
): AutoResult {
  const chosen = state.lifts.filter((l) => !opts.liftIds || opts.liftIds.includes(l.id));
  const tops = new Map(chosen.map((l) => [l.id, liftEnds(dem, l).top]));
  const byTop = [...chosen].sort((a, b) => elevOf(dem, tops.get(a.id)!) - elevOf(dem, tops.get(b.id)!));

  let sim: ResortState = state;
  let spent = 0;
  const plans: AutoPlan[] = [];
  const missed: AutoResult["missed"] = [];

  const offered = () => new Set(sim.pistes.map((p) => p.difficulty));
  const nextGrade = (): PisteGrade => {
    if (opts.mix !== "mixed") return opts.mix;
    const have = offered();
    return GRADES.find((g) => !have.has(g)) ?? "blue";
  };

  /** Survey, price and check a line; null if it cannot be built as it stands. */
  const assess = (hexes: Axial[]) => {
    if (hexes.length < 2) return null;
    if (!validatePistePath(sim, dem, "piste", hexes).ok) return null;
    const survey = surveyPiste(dem, "piste", hexes);
    if (!survey) return null;
    return { grade: survey.grade, cost: discounted(state, survey.cost) };
  };

  const add = (liftId: string, hexes: Axial[], grade: PisteDifficulty, cost: number, why: AutoPlan["why"]) => {
    spent += cost;
    plans.push({ liftId, hexes, grade, cost, why });
    const piste: PlacedPiste = {
      id: `auto-${plans.length}`,
      itemId: "piste",
      difficulty: grade,
      hexes,
      builtAt: 0,
      readyAt: 0,
    };
    sim = { ...sim, pistes: [...sim.pistes, piste] };
  };

  // 1. A way down for every chosen lift that has none.
  for (const lift of byTop) {
    const links = resortLinks(sim, dem);
    if (links.get(lift.id) !== "no-descent") continue;
    const top = tops.get(lift.id)!;
    const goals = descentGoals(sim, dem, top, links);
    const want = nextGrade();
    const route = routeToAny(dem, top, goals, want) ?? routeToAny(dem, top, goals, "any");
    const fit = route ? assess(route) : null;
    if (!route || !fit) {
      missed.push({ liftId: lift.id, reason: "terrain" });
      continue;
    }
    if (spent + fit.cost > opts.budget) {
      missed.push({ liftId: lift.id, reason: "budget" });
      continue;
    }
    add(lift.id, route, fit.grade, fit.cost, "descent");
  }

  // 2. The grades the area does not offer yet, from the highest tops down.
  if (opts.mix === "mixed") {
    for (const grade of GRADES) {
      if (offered().has(grade)) continue;
      for (const lift of [...byTop].reverse()) {
        const top = tops.get(lift.id)!;
        const links = resortLinks(sim, dem);
        if (links.get(lift.id) === "no-access") continue;
        const route = routeToAny(dem, top, descentGoals(sim, dem, top, links), grade);
        if (!route) continue;
        const fit = assess(route);
        if (!fit || fit.grade !== grade || spent + fit.cost > opts.budget) continue;
        if (overlap(route, sim.pistes) > MAX_OVERLAP) continue;
        add(lift.id, route, fit.grade, fit.cost, "variety");
        break;
      }
    }
  }

  return { plans, missed };
}

function elevOf(dem: Dem, hex: Axial): number {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
}

/** Share of a line's hexes already under another run. */
function overlap(hexes: readonly Axial[], pistes: readonly PlacedPiste[]): number {
  const taken = new Set<string>();
  for (const p of pistes) for (const h of p.hexes) taken.add(`${h.q},${h.r}`);
  const inner = hexes.slice(1, -1);
  if (inner.length === 0) return 0;
  return inner.filter((h) => taken.has(`${h.q},${h.r}`)).length / inner.length;
}
