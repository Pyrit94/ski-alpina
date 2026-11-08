// Explicit extensions so the node test runner and the worker load this directly.
import { CLASSIC_REGION } from "../../../packages/config/src/regions.ts";
import {
  getDem,
  loadRegion,
  PENDING_READY,
  planAutoPistes,
  planStationRuns,
  planVillage,
  bestReshape,
  reshapeAll,
  tickFlow,
  type Axial,
  type AutoMix,
  type AutoResult,
  type Reshape,
  type ResortState,
  type SimStats,
  type StationLeg,
  type StationRunsResult,
  type VillagePlan,
} from "../../../packages/shared/src/index.ts";
import type { Dem } from "../../../packages/shared/src/terrain/dem.ts";

/**
 * The planners of the HUD — «Pisten automatisch», «Dorf ordnen», the
 * mid-station's runs, «Pisten verbessern» — as jobs: plain data in, plain
 * data out, so they can run in a worker as well as right here.
 */
export type PlannerJob =
  | { kind: "auto"; state: ResortState; opts: { liftIds?: string[]; mix: AutoMix; budget: number } }
  | { kind: "village"; state: ResortState }
  | { kind: "station"; state: ResortState; liftId: string; mid: Axial; legs: StationLeg[]; opts: { mix: AutoMix; budget: number } }
  | { kind: "reshapeAll"; state: ResortState }
  | { kind: "reshapeOne"; state: ResortState; pisteId: string };

export type PlannerKind = PlannerJob["kind"];

/** «Dorf ordnen»: the moves, and the day's takings before and after them. */
export interface VillageOutcome {
  plan: VillagePlan;
  before: SimStats | null;
  after: SimStats | null;
}

export interface PlannerResults {
  auto: AutoResult;
  village: VillageOutcome;
  station: StationRunsResult;
  reshapeAll: Reshape[];
  /** Wrapped, so «nothing better» is an answer and not «not yet». */
  reshapeOne: { found: Reshape | null };
}

/** A job sent to the worker, on a channel: one panel's latest request supersedes its earlier ones. */
export interface PlannerRequest {
  id: number;
  channel: string;
  job: PlannerJob;
}

export type PlannerReply =
  | { id: number; ok: true; result: PlannerResults[PlannerKind] }
  | { id: number; ok: false; error: string }
  | { id: number; superseded: true };

export type JobOf<K extends PlannerKind> = Extract<PlannerJob, { kind: K }>;

/**
 * The resort fields the planners read. Chat, activity, the hall of fame and
 * the flow drawing stay behind: they are never planned with, and every byte
 * is copied to the worker on each request.
 */
const PLANNER_FIELDS = [
  "version",
  "roomId",
  "resortName",
  "region",
  "coins",
  "gems",
  "stars",
  "xp",
  "season",
  "day",
  "timeOfDay",
  "ticketPrice",
  "buildings",
  "lifts",
  "pistes",
  "quests",
  "tutorialStep",
  "tutorialOpen",
  "weather",
  "stats",
  "unlocked",
  "match",
  "research",
  "speed",
  "todayIncome",
  "proposalLimit",
  "terrain",
  "neighbours",
] as const satisfies readonly (keyof ResortState)[];

/**
 * A resort to plan with: the store's fields the planners need, with the
 * given ones laid over (the stable lists a panel holds). No functions, no
 * UI state: it must survive `postMessage`.
 */
export function plannerState(source: object, over: Partial<ResortState> = {}): ResortState {
  const from = source as Partial<ResortState>;
  const out: Partial<Record<keyof ResortState, unknown>> = {};
  for (const k of PLANNER_FIELDS) if (from[k] !== undefined) out[k] = from[k];
  // Fields the flattened store keeps but planning never needs, filled empty
  // so the engine sees a whole ResortState.
  return { flow: [], contributors: {}, activity: [], hallOfFame: [], chat: [], ...out, ...over } as ResortState;
}

/** The (natural) ground a job plans on; levelled hexes come with `state.terrain`. */
export function demFor(state: ResortState): Dem {
  return getDem(state.region ?? CLASSIC_REGION);
}

/** Load the job's map first: a worker starts without any region in memory. */
export async function loadDemFor(state: ResortState): Promise<Dem> {
  return loadRegion(state.region ?? CLASSIC_REGION);
}

/** Work a job out. Pure: the same job gives the same answer anywhere. */
export function runPlannerJob<K extends PlannerKind>(job: JobOf<K>, dem: Dem): PlannerResults[K];
export function runPlannerJob(job: PlannerJob, dem: Dem): PlannerResults[PlannerKind] {
  switch (job.kind) {
    case "auto":
      return planAutoPistes(job.state, dem, job.opts);
    case "station":
      return planStationRuns(job.state, dem, job.liftId, job.mid, job.legs, job.opts);
    case "reshapeAll":
      return reshapeAll(job.state, dem);
    case "reshapeOne":
      return { found: bestReshape(job.state, dem, job.pisteId) };
    case "village": {
      const state = job.state;
      const plan = planVillage(state, dem);
      if (plan.moves.length === 0) return { plan, before: null, after: null };
      const to = new Map(plan.moves.map((m) => [m.id, m.to]));
      const moved = { ...state, buildings: state.buildings.map((b) => (to.has(b.id) ? { ...b, ...to.get(b.id)! } : b)) };
      // Twice, as the auto planner does: reputation follows the last tick.
      const run = (s: ResortState) => tickFlow({ ...s, stats: tickFlow(s, dem, 0, PENDING_READY).stats }, dem, 0, PENDING_READY).stats;
      return { plan, before: run(state), after: run(moved) };
    }
  }
}
