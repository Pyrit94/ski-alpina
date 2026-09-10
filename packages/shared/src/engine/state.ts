import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import type {
  PlacedBuilding,
  PlacedLift,
  PlacedPiste,
  ResortState,
  SimStats,
  WeatherState,
} from "../types.ts";

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
  snowLineM: 0,
  closedPistes: 0,
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
      tier: 0,
    })),
    tutorialStep: 0,
    tutorialOpen: true,
    weather: { ...DEFAULT_WEATHER },
    stats: { ...DEFAULT_STATS },
    flow: [],
    unlocked: [],
    contributors: {},
    activity: [],
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
      const tier = saved?.tier ?? 0;
      // Target and reward are derived from the tier rather than trusted from
      // the save, so retuning a contract in config reaches players mid-run.
      const scale = def.repeatable ? Math.pow(def.growth ?? 1.6, tier) : 1;
      return {
        id: def.id,
        title: def.title,
        hint: def.hint,
        xp: Math.round(def.xp * scale),
        coins: Math.round(def.coins * scale),
        gems: Math.round(def.gems * scale),
        target: Math.round(def.target * scale),
        progress: saved?.progress ?? 0,
        claimed: saved?.claimed ?? false,
        tier,
      };
    }),
    buildings: snapshot.buildings ?? [],
    lifts: snapshot.lifts ?? [],
    pistes: snapshot.pistes ?? [],
    flow: snapshot.flow ?? [],
    unlocked: snapshot.unlocked ?? [],
    contributors: snapshot.contributors ?? {},
    activity: snapshot.activity ?? [],
  };
}

export type ResortEntity =
  | { kind: "lift"; lift: PlacedLift }
  | { kind: "building"; building: PlacedBuilding }
  | { kind: "piste"; piste: PlacedPiste };

/**
 * What an id refers to, for anything that acts on a placed thing.
 *
 * Placing a lift also records its two stations in `buildings`, and the map
 * selects a station by its own id — so a station id has to resolve to the
 * cableway it belongs to. Otherwise demolishing a station would leave a lift
 * running between two removed buildings.
 */
export function findEntity(state: ResortState, id: string): ResortEntity | null {
  const lift =
    state.lifts.find((l) => l.id === id) ??
    state.lifts.find((l) => l.stationA === id || l.stationB === id);
  if (lift) return { kind: "lift", lift };
  const building = state.buildings.find((b) => b.id === id);
  if (building) return { kind: "building", building };
  const piste = state.pistes.find((p) => p.id === id);
  if (piste) return { kind: "piste", piste };
  return null;
}

/** What the entity cost to build, which is what a refund is a share of. */
export function entityCost(entity: ResortEntity): { coins: number; gems: number } {
  const item =
    entity.kind === "lift"
      ? BY_ID[entity.lift.itemId]
      : entity.kind === "building"
        ? BY_ID[entity.building.itemId]
        : BY_ID[entity.piste.itemId];
  const segments = entity.kind === "piste" ? Math.max(1, entity.piste.hexes.length - 1) : 1;
  return { coins: item.cost * segments, gems: (item.gemCost ?? 0) * segments };
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
