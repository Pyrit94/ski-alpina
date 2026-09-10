import { ECONOMY } from "../../../config/src/economy.ts";
import type { Dem } from "../terrain/dem.ts";
import type { ResortState } from "../types.ts";
import { tickFlow } from "./flow.ts";
import { syncQuestProgress } from "./quests.ts";

export function tickResort(state: ResortState, dem: Dem, dtSeconds: number, now: number): ResortState {
  const timeOfDay = (state.timeOfDay + dtSeconds / ECONOMY.daySecondsReal) % 1;
  let day = state.day;
  let season = state.season;
  let visitorsToday = state.stats.visitorsToday;
  if (timeOfDay < state.timeOfDay) {
    day += 1;
    visitorsToday = 0;
    if (day > 90) {
      day = 1;
      season += 1;
    }
  }
  const dtHours = dtSeconds / ECONOMY.daySecondsReal;
  const flowed = tickFlow({ ...state, timeOfDay, day, season, stats: { ...state.stats, visitorsToday } }, dem, dtHours, now);
  const next: ResortState = {
    ...state,
    timeOfDay,
    day,
    season,
    // Upkeep can outrun takings, but nothing can be demolished yet, so a
    // player who overbuilds must be able to earn their way out rather than
    // sink into a debt no action can clear.
    coins: Math.max(0, state.coins + flowed.coinsDelta),
    stats: flowed.stats,
    flow: flowed.flow,
  };
  return syncQuestProgress(next);
}
