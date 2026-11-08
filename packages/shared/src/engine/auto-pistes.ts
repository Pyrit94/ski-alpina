import { FLOW, PISTE_PLANNER, PISTE_SCORE } from "../../../config/src/economy.ts";
import type { PisteGrade } from "../../../config/src/terrain.ts";
import { HEX_SIZE, hexDistance, hexToWorld, worldToHex, type Axial } from "../hex.ts";
import { MAX_PISTE_HEXES } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PisteDifficulty, PlacedPiste, ResortState, SimStats } from "../types.ts";
import { descentGoals, liftEnds, resortLinks } from "./descent.ts";
import { neighbourAvoid } from "./neighbours.ts";
import { tickFlow } from "./flow.ts";
import { PENDING_READY } from "./match.ts";
import { routePiste, routeToAny } from "./piste-route.ts";
import { scorePiste } from "./piste-score.ts";
import { discounted } from "./research.ts";
import { seasonDemandShare } from "./season.ts";
import { surveyPiste, validatePistePath } from "./validate.ts";

/**
 * «Pisten automatisch»: the runs a layout is missing, and the ones that would
 * make it carry more — chosen by running the simulation, not by rule of thumb.
 *
 * 1. Every chosen lift with no way down gets one first, lowest top station
 *    first so a higher lift's run can end on a lower lift's new run. Of the
 *    lines the ground allows (each grade, any grade), the one the simulation
 *    likes best wins.
 * 2. Then, greedily: every candidate line from every chosen top — each grade,
 *    to the nearest place it may end and to a different one for a second,
 *    parallel run — is built on a copy of the resort and simulated. The one
 *    that adds the most per franc is kept, as long as it pays for itself
 *    within `PISTE_PLANNER.paybackDays`; then the next round starts from the
 *    resort with that run in it. This is what relieves a lift whose run is
 *    full, adds the colour a lift is missing, and stops once the limit is no
 *    longer the runs but the car parks.
 *
 * The simulation is judged at midday on a good winter day, twice over, so a
 * run that makes guests happier is credited with the guests that brings.
 *
 * Besides the plain line down, every top also offers lines with swings: bent
 * through a point beside the plain line's middle, or an S through two. Each
 * line carries its rating (see PISTE_SCORE), and a better run to ski is worth
 * a share more than its money alone, so the planner prefers a flowing run
 * when it pays nearly as well as a straight one.
 *
 * Nothing is placed here. Each plan is an ordinary `place_piste` the server
 * validates again; plans build on each other in order and are sent in order.
 */

export type AutoMix = "mixed" | PisteGrade;

export interface AutoPlan {
  liftId: string;
  hexes: Axial[];
  grade: PisteDifficulty;
  /** CHF, research discount included. */
  cost: number;
  /** "descent": the lift had no way down; "relief": its runs were full; "draw": more guests come. */
  why: "descent" | "relief" | "draw";
  /** What the simulation says this run adds, per hour and per day. */
  gainGuests: number;
  gainIncome: number;
  /** Its rating, 0 … 100 (see PISTE_SCORE). */
  points: number;
}

export interface AutoOutlook {
  guestsPerHour: number;
  incomePerHour: number;
  satisfaction: number;
}

export interface AutoResult {
  plans: AutoPlan[];
  /** Lifts that needed a run but got none, and why. */
  missed: { liftId: string; reason: "terrain" | "budget" }[];
  before: AutoOutlook;
  after: AutoOutlook;
  /** What holds the resort back once the plan is built. */
  limit: "doors" | "lift" | "none";
  /** Name of the busiest lift, when that is the limit. */
  limitLabel: string;
}

const GRADES: PisteGrade[] = ["blue", "red", "black"];

interface Candidate {
  liftId: string;
  hexes: Axial[];
  grade: PisteDifficulty;
  cost: number;
  points: number;
}

/** A value raised by a run's rating: a better run to ski is worth a share more. */
export const rated = (value: number, points: number) => {
  const share = (PISTE_SCORE.plannerWeight * points) / 100;
  return value >= 0 ? value * (1 + share) : value * (1 - share / 2);
};

/**
 * Lines with swings from `top`: the plain line bent through a point beside
 * its middle, either side, or an S through two points on opposite sides.
 * Each piece is routed with the same legal-line rules, so every line returned
 * is one the server would accept.
 */
export function swingLines(
  dem: Dem,
  top: Axial,
  goals: readonly Axial[],
  grade: PisteGrade,
  plain: Axial[] | null,
  /** Hexes the lines must go around, e.g. a neighbour's runs. */
  avoid?: ReadonlySet<string>,
): Axial[][] {
  if (!plain || plain.length < 6) return [];
  const a = hexToWorld(top.q, top.r);
  const end = plain[plain.length - 1]!;
  const b = hexToWorld(end.q, end.r);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = -(b.z - a.z) / len;
  const nz = (b.x - a.x) / len;
  const step = HEX_SIZE * Math.sqrt(3);
  const beside = (t: number, hexes: number) => {
    const h = plain[Math.round(t * (plain.length - 1))]!;
    const p = hexToWorld(h.q, h.r);
    return worldToHex(p.x + nx * hexes * step, p.z + nz * hexes * step);
  };
  const tries: Axial[][] = [
    [beside(0.5, 3)],
    [beside(0.5, -3)],
    [beside(0.33, 3), beside(0.66, -3)],
    [beside(0.33, -3), beside(0.66, 3)],
    [beside(0.5, 5)],
    [beside(0.5, -5)],
  ];
  const out: Axial[][] = [];
  for (const points of tries) {
    let line: Axial[] = [top];
    for (const wp of points) {
      const seg = routePiste(dem, line[line.length - 1]!, wp, grade, { maxHexes: MAX_PISTE_HEXES - line.length + 1, avoid });
      if (!seg) {
        line = [];
        break;
      }
      line = [...line, ...seg.slice(1)];
    }
    if (line.length < 2) continue;
    const tail = routeToAny(dem, line[line.length - 1]!, goals, grade, { maxHexes: MAX_PISTE_HEXES - line.length + 1, avoid });
    if (!tail) continue;
    line = [...line, ...tail.slice(1)];
    // A line that crosses itself is no run.
    if (new Set(line.map((h) => `${h.q},${h.r}`)).size !== line.length) continue;
    out.push(line);
  }
  return out;
}

export function planAutoPistes(
  state: ResortState,
  dem: Dem,
  opts: { liftIds?: readonly string[]; mix: AutoMix; budget: number },
): AutoResult {
  // Planned twice: with the swinging lines and with plain lines only. A
  // greedy plan can be led astray by one long, flowing run that blocks a
  // better one later, so the creative plan wins unless it gives away more
  // than its runs' rating is worth.
  const creative = plan(state, dem, opts, true);
  const plain = plan(state, dem, opts, false);
  const worth = (r: AutoResult) => {
    const gain = r.after.incomePerHour - r.before.incomePerHour;
    const points = r.plans.length ? r.plans.reduce((n, p) => n + p.points, 0) / r.plans.length : 0;
    return rated(gain, points);
  };
  return worth(creative) >= worth(plain) ? creative : plain;
}

function plan(
  state: ResortState,
  dem: Dem,
  opts: { liftIds?: readonly string[]; mix: AutoMix; budget: number },
  swing: boolean,
): AutoResult {
  // A neighbour's runs and stations are not the players' to build on.
  const avoid = neighbourAvoid(state);
  const swingingLines = swing
    ? (d: Dem, t: Axial, goals: readonly Axial[], g: PisteGrade, plain: Axial[] | null) => swingLines(d, t, goals, g, plain, avoid)
    : () => [];
  const chosen = state.lifts.filter((l) => !opts.liftIds || opts.liftIds.includes(l.id));
  const tops = new Map(chosen.map((l) => [l.id, liftEnds(dem, l).top]));
  const byTop = [...chosen].sort((a, b) => elevOf(dem, tops.get(a.id)!) - elevOf(dem, tops.get(b.id)!));
  const grades: PisteGrade[] = opts.mix === "mixed" ? GRADES : [opts.mix];

  const judge = goodDayJudge(state, dem);
  const outlook = (st: SimStats): AutoOutlook => ({
    guestsPerHour: st.guestsPerHour,
    incomePerHour: st.incomePerHour,
    satisfaction: st.satisfaction,
  });

  let sim: ResortState = state;
  let current = judge(sim);
  const before = outlook(current);
  let spent = 0;
  const plans: AutoPlan[] = [];
  const missed: AutoResult["missed"] = [];

  /** Survey, price and check a line; null if it cannot be built as it stands. */
  const assess = (liftId: string, hexes: Axial[] | null): Candidate | null => {
    if (!hexes || hexes.length < 2) return null;
    if (!validatePistePath(sim, dem, "piste", hexes).ok) return null;
    const survey = surveyPiste(dem, "piste", hexes);
    if (!survey) return null;
    return { liftId, hexes, grade: survey.grade, cost: discounted(state, survey.cost), points: scorePiste(hexes, dem).points };
  };
  const withRun = (c: Candidate): ResortState => {
    const piste: PlacedPiste = {
      id: `auto-${plans.length + 1}`,
      itemId: "piste",
      difficulty: c.grade,
      hexes: c.hexes,
      builtAt: 0,
      readyAt: 0,
      // So the simulation credits what a good run draws.
      score: c.points,
    };
    return { ...sim, pistes: [...sim.pistes, piste] };
  };
  const score = (st: SimStats) => st.incomePerHour;
  const add = (c: Candidate, next: ResortState, stats: SimStats, why: AutoPlan["why"]) => {
    plans.push({
      ...c,
      why,
      gainGuests: Math.round(stats.guestsPerHour - current.guestsPerHour),
      gainIncome: Math.round(stats.incomePerHour - current.incomePerHour),
    });
    spent += c.cost;
    sim = next;
    current = stats;
  };
  const affordable = (c: Candidate) => spent + c.cost <= opts.budget;

  // 1. A way down for every chosen lift that has none.
  const descents = (record: boolean) => {
    for (const lift of byTop) {
      const links = resortLinks(sim, dem);
      if (links.get(lift.id) !== "no-descent") continue;
      const top = tops.get(lift.id)!;
      const goals = descentGoals(sim, dem, top, links);
      const plain = grades.map((g) => ({ g, line: routeToAny(dem, top, goals, g, { avoid }) }));
      const options = dedupe(
        [
          ...plain.map((p) => p.line),
          routeToAny(dem, top, goals, "any", { avoid }),
          ...plain.flatMap((p) => swingingLines(dem, top, goals, p.g, p.line)),
        ]
          .map((h) => assess(lift.id, h))
          .filter((c): c is Candidate => c !== null),
      );
      const inBudget = options.filter(affordable);
      if (inBudget.length === 0) {
        if (record) missed.push({ liftId: lift.id, reason: options.length === 0 ? "terrain" : "budget" });
        continue;
      }
      // Prefer the grade asked for; among those, what the simulation likes best.
      const wanted = inBudget.filter((c) => grades.includes(c.grade as PisteGrade));
      let best: { c: Candidate; next: ResortState; stats: SimStats } | null = null;
      for (const c of wanted.length > 0 ? wanted : inBudget) {
        const next = withRun(c);
        const stats = judge(next);
        if (!best || rated(score(stats), c.points) > rated(score(best.stats), best.c.points)) best = { c, next, stats };
      }
      add(best!.c, best!.next, best!.stats, "descent");
      if (!record) {
        const i = missed.findIndex((m) => m.liftId === lift.id);
        if (i >= 0) missed.splice(i, 1);
      }
    }
  };
  descents(true);

  // 2. Whatever pays: greedy, one run per round, judged by the simulation.
  for (let round = 0; round < PISTE_PLANNER.maxExtraRuns; round++) {
    const links = resortLinks(sim, dem);
    const candidates: Candidate[] = [];
    for (const lift of [...byTop].reverse()) {
      if (links.get(lift.id) === "no-access" || links.get(lift.id) === "no-descent") continue;
      const top = tops.get(lift.id)!;
      const goals = descentGoals(sim, dem, top, links);
      // A second line should not end where this top's runs already end.
      const ownEnds = sim.pistes
        .filter((p) => hexDistance(p.hexes[0]!, top) <= FLOW.linkRadius)
        .map((p) => p.hexes[p.hexes.length - 1]!);
      const elsewhere = goals.filter((g) => ownEnds.every((e) => hexDistance(e, g) > 2));
      for (const g of grades) {
        const near = routeToAny(dem, top, goals, g, { avoid });
        const far = routeToAny(dem, top, elsewhere, g, { avoid });
        candidates.push(
          ...[near, far, ...swingingLines(dem, top, goals, g, near), ...swingingLines(dem, top, elsewhere, g, far)]
            .map((h) => assess(lift.id, h))
            .filter((c): c is Candidate => c !== null),
        );
      }
    }
    const fresh = dedupe(candidates)
      .filter((c) => grades.includes(c.grade as PisteGrade))
      .filter(affordable)
      .filter((c) => overlap(c.hexes, sim.pistes) <= PISTE_PLANNER.maxOverlap)
      .slice(0, PISTE_PLANNER.candidateLimit);
    let best: { c: Candidate; next: ResortState; stats: SimStats; value: number } | null = null;
    for (const c of fresh) {
      const next = withRun(c);
      const stats = judge(next);
      const gain = score(stats) - score(current);
      // Pays for itself within the payback window, measured on good days.
      if (gain <= 0 || gain * PISTE_PLANNER.paybackDays < c.cost) continue;
      const value = rated(gain, c.points) / c.cost;
      if (!best || value > best.value) best = { c, next, stats, value };
    }
    if (!best) break;
    // Relief when the busiest thing on the mountain was this lift or a run off its top.
    const top = tops.get(best.c.liftId)!;
    const jammed =
      current.bottleneckUse >= 0.9 &&
      (current.bottleneckId === best.c.liftId ||
        sim.pistes.some((p) => p.id === current.bottleneckId && hexDistance(p.hexes[0]!, top) <= FLOW.linkRadius));
    add(best.c, best.next, best.stats, jammed ? "relief" : "draw");
  }

  // New runs are new places to end on: try the lifts still without a way down once more.
  if (missed.length > 0) descents(false);

  const after = outlook(current);
  const doorsFull = current.turnedAway > Math.max(20, current.marketPerHour * 0.1);
  const liftFull = !doorsFull && current.bottleneckUse >= 0.95 && state.lifts.some((l) => l.id === current.bottleneckId);
  return {
    plans,
    missed,
    before,
    after,
    limit: doorsFull ? "doors" : liftFull ? "lift" : "none",
    limitLabel: liftFull ? current.bottleneckLabel : "",
  };
}

/**
 * How the simulation sees a layout on a good day: midday, in season,
 * everything planned counted as built, run twice so reputation catches up.
 */
export function goodDayJudge(state: ResortState, dem: Dem): (s: ResortState) => SimStats {
  const day = seasonDemandShare(state.day) >= 1 ? state.day : 10;
  return (s) => {
    const probe = { ...s, day, timeOfDay: 0.5 };
    const first = tickFlow(probe, dem, 0, PENDING_READY).stats;
    // Once more with the reputation the first pass earned.
    return tickFlow({ ...probe, stats: first }, dem, 0, PENDING_READY).stats;
  };
}

function elevOf(dem: Dem, hex: Axial): number {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
}

function dedupe(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = c.hexes.map((h) => `${h.q},${h.r}`).join(";");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Share of a line's hexes already under another run. */
export function overlap(hexes: readonly Axial[], pistes: readonly { hexes: readonly Axial[] }[]): number {
  const taken = new Set<string>();
  for (const p of pistes) for (const h of p.hexes) taken.add(`${h.q},${h.r}`);
  const inner = hexes.slice(1, -1);
  if (inner.length === 0) return 0;
  return inner.filter((h) => taken.has(`${h.q},${h.r}`)).length / inner.length;
}
