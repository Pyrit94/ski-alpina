import { ECONOMY } from "../../../config/src/economy.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import type { ResortState, SimStats, WeatherState } from "../types.ts";

export const DEFAULT_STATS: SimStats = {
  peoplePerHour: 0,
  satisfaction: ECONOMY.targetSatisfaction,
  incomePerHour: 0,
  revenuePerHour: 0,
  upkeepPerHour: 0,
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

/**
 * Bring a persisted snapshot up to the current shape.
 *
 * Saves outlive the code that wrote them. A room stored before a stat existed
 * hands the client `undefined`, which renders as NaN rather than failing
 * loudly, so every field is backfilled from a fresh resort. Quests merge by id
 * so a newly added goal appears in an old save while progress already made
 * survives, and a retired one simply drops out.
 */
export function migrateResort(snapshot: Partial<ResortState>, roomId?: string): ResortState {
  const base = emptyResort(roomId ?? snapshot.roomId ?? "zermatt");
  return {
    ...base,
    ...snapshot,
    version: base.version,
    roomId: base.roomId,
    stats: { ...base.stats, ...snapshot.stats },
    weather: { ...base.weather, ...snapshot.weather },
    quests: QUEST_DEFS.map((def) => {
      const saved = snapshot.quests?.find((q) => q.id === def.id);
      const fresh = {
        id: def.id,
        title: def.title,
        hint: def.hint,
        xp: def.xp,
        coins: def.coins,
        gems: def.gems,
        progress: 0,
        target: def.target,
        claimed: false,
      };
      // Rewards and wording follow the config; only the player's state carries over.
      return saved ? { ...fresh, progress: saved.progress, claimed: saved.claimed } : fresh;
    }),
    buildings: snapshot.buildings ?? [],
    lifts: snapshot.lifts ?? [],
    pistes: snapshot.pistes ?? [],
    flow: snapshot.flow ?? [],
    unlocked: snapshot.unlocked ?? [],
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
