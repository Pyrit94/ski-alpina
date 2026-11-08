import { useMemo } from "react";
import { getDem, longGoals, rankOf, type LongGoalView, type RankView, type SeasonSummary } from "@ski/shared";
import { useGame } from "./store";

/**
 * Client side of the free-play progression (engine/progression.ts): the
 * rank and the long-term goals are worked out from the mirrored state with
 * the same functions the server uses, so the HUD never disagrees with it.
 */

/** The resort's rank as it stands. */
export function useRank(): RankView {
  const pistes = useGame((s) => s.pistes);
  const stats = useGame((s) => s.stats);
  const daily = useGame((s) => s.daily);
  const progress = useGame((s) => s.progress);
  return useMemo(() => rankOf({ pistes, stats, daily, progress }), [pistes, stats, daily, progress]);
}

/** Every long-term goal with its progress. */
export function useLongGoals(): LongGoalView[] {
  const pistes = useGame((s) => s.pistes);
  const lifts = useGame((s) => s.lifts);
  const stats = useGame((s) => s.stats);
  const neighbours = useGame((s) => s.neighbours);
  const progress = useGame((s) => s.progress);
  const region = useGame((s) => s.regionReady);
  return useMemo(
    () => longGoals({ pistes, lifts, stats, neighbours, progress }, getDem(region ?? undefined)),
    [pistes, lifts, stats, neighbours, progress, region],
  );
}

/** A finished season and the one before it, for the deltas. */
export function seasonPair(seasons: readonly SeasonSummary[], season: number): { now: SeasonSummary; before: SeasonSummary | null } | null {
  const i = seasons.findIndex((s) => s.season === season);
  if (i < 0) return null;
  return { now: seasons[i]!, before: seasons[i - 1] ?? null };
}

/** Change against last season, as a signed percentage, or null without one. */
export function deltaPct(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
