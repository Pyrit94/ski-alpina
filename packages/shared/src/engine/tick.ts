import { ECONOMY, SEASON } from "../../../config/src/economy.ts";
import type { Dem } from "../terrain/dem.ts";
import type { ResortState } from "../types.ts";
import { tickFlow } from "./flow.ts";
import { syncQuestProgress } from "./quests.ts";
import { weatherForDay } from "./weather.ts";

export function tickResort(state: ResortState, dem: Dem, dtSeconds: number, now: number): ResortState {
  const timeOfDay = (state.timeOfDay + dtSeconds / ECONOMY.daySecondsReal) % 1;
  let day = state.day;
  let season = state.season;
  let visitorsToday = state.stats.visitorsToday;
  let weather = state.weather;
  if (timeOfDay < state.timeOfDay) {
    day += 1;
    visitorsToday = 0;
    if (day > SEASON.daysPerYear) {
      day = 1;
      season += 1;
    }
    // The sim owns the sky: it decides the snow line, so it cannot be left to
    // whatever a client last happened to fetch.
    weather = weatherForDay(season, day);
  }
  const dtHours = dtSeconds / ECONOMY.daySecondsReal;
  const flowed = tickFlow(
    { ...state, timeOfDay, day, season, weather, stats: { ...state.stats, visitorsToday } },
    dem,
    dtHours,
    now,
  );
  const next: ResortState = {
    ...state,
    timeOfDay,
    day,
    season,
    weather,
    // Upkeep can outrun takings, but nothing can be demolished yet, so a
    // player who overbuilds must be able to earn their way out rather than
    // sink into a debt no action can clear.
    coins: Math.max(0, state.coins + flowed.coinsDelta),
    stats: flowed.stats,
    flow: flowed.flow,
  };
  return syncQuestProgress(next);
}
