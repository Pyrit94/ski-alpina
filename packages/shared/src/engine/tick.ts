import { ECONOMY, SEASON } from "../../../config/src/economy.ts";
import type { Dem } from "../terrain/dem.ts";
import type { ResortState } from "../types.ts";
import { tickFlow } from "./flow.ts";
import { closeNeighbourDay } from "./neighbours.ts";
import { syncQuestProgress } from "./quests.ts";
import { weatherForDay } from "./weather.ts";
import { accrueResearch } from "./research.ts";
import { followTutorial } from "./tutorial.ts";
import { advanceProgress, marketShare, type ProgressTick } from "./progression.ts";
import type { DailyRecord } from "../types.ts";

export function tickResort(state: ResortState, dem: Dem, realSeconds: number, now: number): ResortState {
  // Free play can be paused or sped up; a match has no clock of its own.
  const speed = state.match?.mode === "match" ? 1 : (state.speed ?? 1);
  const dtSeconds = realSeconds * speed;
  const timeOfDay = (state.timeOfDay + dtSeconds / ECONOMY.daySecondsReal) % 1;
  let day = state.day;
  let season = state.season;
  let visitorsToday = state.stats.visitorsToday;
  let weather = state.weather;
  let daily = state.daily;
  let todayIncome = state.todayIncome ?? 0;
  let neighbours = state.neighbours;
  let fees = 0;
  let ended: DailyRecord | null = null;
  let closedProfit = 0;
  if (timeOfDay < state.timeOfDay) {
    // The neighbours close their day too: takings, and now and then a new
    // lift; and a «Tarifverbund» costs its fee.
    const closed = closeNeighbourDay(state, dem, now);
    neighbours = closed.neighbours;
    fees = state.coins - closed.coins;
    // The day just ended: keep one line of it for the charts.
    ended = {
      season: state.season,
      day: state.day,
      guests: Math.round(state.stats.visitorsToday),
      income: Math.round(todayIncome),
      satisfaction: state.stats.satisfaction,
    };
    closedProfit = todayIncome - fees;
    daily = [...(state.daily ?? []), ended].slice(-ECONOMY.historyDays);
    todayIncome = 0;
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
    coins: Math.max(0, state.coins - fees + flowed.coinsDelta),
    stats: flowed.stats,
    flow: flowed.flow,
    ...(daily ? { daily } : {}),
    todayIncome: todayIncome + flowed.coinsDelta,
    ...(neighbours ? { neighbours } : {}),
  };
  // Free-play progression: the season's tally, its report, rank and goals.
  const progress: ProgressTick = {
    closed: ended,
    closedProfit,
    closedShare: marketShare(state),
    revenue: flowed.stats.revenuePerHour * dtHours,
  };
  const progressed = advanceProgress(next, dem, progress, state.season, now);
  return followTutorial(syncQuestProgress(accrueResearch(progressed, flowed.stats, dtHours, now)));
}
