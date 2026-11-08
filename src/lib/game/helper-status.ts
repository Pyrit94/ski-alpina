// Explicit extensions so the node test runner can load this directly.
import type { Category, ItemId } from "../../../packages/config/src/ids.ts";
import type { AutoMix } from "../../../packages/shared/src/engine/auto-pistes.ts";
import type { HelperId, HelperOpen } from "./helpers.ts";

/**
 * What the «Assistent» knows about the resort, read off the store by
 * `useAssistFacts` (assist.ts). Plain data, so the status lines and the
 * discovery hints built from it are pure and tested.
 */
export interface AssistFacts {
  lifts: number;
  /** Lifts no run leads down from. */
  liftsWithoutDescent: number;
  /** Runs (no roads). */
  runs: number;
  /** The weakest run below LOW_RUN_POINTS, if any, and how many are. */
  lowRun: { id: string; name: string; points: number } | null;
  lowRuns: number;
  /** Value-weighted mean location of restaurants, shops and hotels; null without any. */
  villageAverage: number | null;
  /** The lift without a middle station that is long enough for one. */
  midCandidate: { liftId: string; name: string } | null;
  /** Neighbour areas are on at all. */
  neighboursOn: boolean;
  /** The neighbour that takes the largest share of your guests (not in a pact). */
  topNeighbour: { id: string; name: string; share: number } | null;
  /** All neighbours are partners in a «Tarifverbund». */
  allPacts: boolean;
  /** A neighbour whose estimate your money covers. */
  buyable: { id: string; name: string; estimate: number } | null;
  /** The newest finished research that unlocked something to build. */
  researchUnlock: { nodeId: string; itemId: ItemId; itemName: string; category: Category } | null;
  /** The grades the piste assistant was last asked for. */
  mix: AutoMix;
}

/** Below this many points (two stars) a run counts as weak. */
export const LOW_RUN_POINTS = 40;
/** Below this, the village is worth reordering. */
export const VILLAGE_POOR = 0.7;
/** From this share of guests a neighbour is worth a look. */
export const NEIGHBOUR_NOTABLE = 0.05;

export interface HelperRow {
  id: Exclude<HelperId, "hub">;
  title: string;
  /** One line about the resort, as it stands. */
  status: string;
  /** Higher is more useful now; rows are sorted by it. 0: nothing to do. */
  score: number;
  /** What a tap opens; null: nothing to open yet (the row is shown greyed). */
  open: HelperOpen | null;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** «Pisten automatisch»: lifts without a way down first. */
export function autoStatus(f: AssistFacts): HelperRow {
  const open: HelperOpen = { id: "auto", liftIds: null, mix: f.mix };
  if (f.lifts === 0) return { id: "auto", title: "Pisten automatisch", status: "Erst eine Bahn bauen", score: 0, open };
  if (f.liftsWithoutDescent > 0) {
    return {
      id: "auto",
      title: "Pisten automatisch",
      status: `${plural(f.liftsWithoutDescent, "Bahn", "Bahnen")} ohne Abfahrt`,
      score: 90,
      open,
    };
  }
  return { id: "auto", title: "Pisten automatisch", status: "Mehr Pisten, wo sie sich lohnen", score: 25, open };
}

/** «Dorf ordnen»: the mean location of the village's businesses. */
export function villageStatus(f: AssistFacts): HelperRow {
  const open: HelperOpen = { id: "village" };
  if (f.villageAverage === null) {
    return { id: "village", title: "Dorf ordnen", status: "Noch keine Restaurants, Läden oder Hotels", score: 0, open: null };
  }
  const a = f.villageAverage;
  return {
    id: "village",
    title: "Dorf ordnen",
    status: `Lage im Schnitt ${pct(a)}`,
    score: a < VILLAGE_POOR ? 70 : a < 0.85 ? 40 : 10,
    open,
  };
}

/** «Pisten optimieren»: runs with few points have room for a better line. */
export function reshapeStatus(f: AssistFacts): HelperRow {
  const open: HelperOpen = { id: "reshape" };
  if (f.runs === 0) return { id: "reshape", title: "Pisten optimieren", status: "Noch keine Pisten", score: 0, open: null };
  if (f.lowRuns > 0) {
    return {
      id: "reshape",
      title: "Pisten optimieren",
      status: `${plural(f.lowRuns, "Piste hat", "Pisten haben")} wenig Punkte`,
      score: 50 + Math.min(10, f.lowRuns * 2),
      open,
    };
  }
  return { id: "reshape", title: "Pisten optimieren", status: "Schwungvollere Linien suchen", score: 15, open };
}

/** «Nachbarn»: who takes the most, or who is for sale. Null when neighbours are off. */
export function neighbourStatus(f: AssistFacts): HelperRow | null {
  if (!f.neighboursOn) return null;
  const title = "Nachbarn";
  if (f.buyable) {
    return {
      id: "neighbour",
      title,
      status: `${f.buyable.name} wäre zu kaufen`,
      score: 60,
      open: { id: "neighbour", neighbourId: f.buyable.id },
    };
  }
  if (f.topNeighbour) {
    const t = f.topNeighbour;
    return {
      id: "neighbour",
      title,
      status: `${t.name} nimmt euch ${pct(t.share)}`,
      score: t.share >= NEIGHBOUR_NOTABLE ? 55 + Math.min(15, Math.round(t.share * 100)) : 15,
      open: { id: "neighbour", neighbourId: t.id },
    };
  }
  return { id: "neighbour", title, status: f.allPacts ? "Tarifverbund mit allen" : "Noch keine Nachbarn", score: 0, open: null };
}

/** «Mittelstation»: a lift long enough for a stop part-way up. */
export function midStationStatus(f: AssistFacts): HelperRow {
  if (!f.midCandidate) {
    return { id: "midstation", title: "Mittelstation", status: f.lifts === 0 ? "Erst eine Bahn bauen" : "Keine Bahn ist lang genug", score: 0, open: null };
  }
  return {
    id: "midstation",
    title: "Mittelstation",
    status: `${f.midCandidate.name} ist lang genug`,
    score: 35,
    open: { id: "midstation", liftId: f.midCandidate.liftId },
  };
}

/** Every helper with its line, the most useful first; ties keep this order. */
export function helperRows(f: AssistFacts): HelperRow[] {
  const rows = [autoStatus(f), villageStatus(f), reshapeStatus(f), neighbourStatus(f), midStationStatus(f)].filter(
    (r): r is HelperRow => r !== null,
  );
  return rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map(({ r }) => r);
}

/** Rows worth a dot on the «Assistent» button. */
export function usefulCount(rows: readonly HelperRow[]): number {
  return rows.filter((r) => r.open && r.score >= 50).length;
}
