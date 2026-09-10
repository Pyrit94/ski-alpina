import { ECONOMY } from "../../../config/src/economy.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import type { ResortState, SimStats, WeatherState } from "../types.ts";

export const DEFAULT_STATS: SimStats = {
  peoplePerHour: 0,
  satisfaction: ECONOMY.targetSatisfaction,
  incomePerHour: 0,
  visitorsToday: 0,
  visitorsTotal: 0,
  occupancy: 0,
  waitMinutes: 4,
  pisteKm: 0,
  beds: 0,
  liftCapacity: 0,
  queued: 0,
  demandPerHour: 0,
  idleLifts: 0,
  idlePistes: 0,
  verticalPerHour: 0,
  bottleneckLabel: "",
  bottleneckId: "",
  bottleneckUse: 0,
};

export const DEFAULT_WEATHER: WeatherState = {
  kind: "sun",
  tempC: -6,
  snowQuality: 0.86,
  live: false,
  label: "Klar, Pulver",
};

export function emptyResort(roomId = "zermatt"): ResortState {
  return {
    version: 2,
    roomId,
    resortName: "Ski Builder",
    coins: ECONOMY.startingCoins,
    gems: ECONOMY.startingGems,
    stars: ECONOMY.startingStars,
    xp: 0,
    season: 1,
    day: 1,
    timeOfDay: 0.34,
    ticketPrice: ECONOMY.ticketDefault,
    buildings: [],
    lifts: [],
    pistes: [],
    quests: QUEST_DEFS.map((q) => ({
      id: q.id,
      title: q.title,
      hint: q.hint,
      xp: q.xp,
      coins: q.coins,
      gems: q.gems,
      progress: 0,
      target: q.target,
      claimed: false,
    })),
    tutorialStep: 0,
    tutorialOpen: true,
    weather: { ...DEFAULT_WEATHER },
    stats: { ...DEFAULT_STATS },
    flow: [],
    unlocked: [],
  };
}

export function occupiedSet(state: ResortState): Set<string> {
  const set = new Set<string>();
  for (const b of state.buildings) set.add(`${b.q},${b.r}`);
  for (const l of state.lifts) {
    set.add(`${l.a.q},${l.a.r}`);
    set.add(`${l.b.q},${l.b.r}`);
  }
  return set;
}
