import { BUILDING_LEVELS, ECONOMY, PISTE_LEVELS } from "../../../config/src/economy.ts";
import { CLASSIC_REGION, REGION_BY_ID } from "../../../config/src/regions.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import type {
  MatchOptions,
  ResearchState,
  MatchState,
  RoundModifiers,
  Upgrades,
  PisteDifficulty,
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
  turnedAway: 0,
  marketPerHour: 0,
  guestsPerHour: 0,
};

export const NO_MODS: RoundModifiers = { demand: 1, snow: 0, wait: 1, upkeep: 1, ticket: 1, closed: [] };

/** The rules a match starts with unless the players pick others. */
export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  economy: "shared",
  roleSplit: 50,
  events: "first",
  secretGoals: false,
  vips: true,
  album: true,
  research: true,
  teamwork: true,
};

export function emptyResearch(): ResearchState {
  return { done: [], active: null, points: 0, pledges: {}, queue: [] };
}

/** Free play: no rounds, no end, the clock runs while someone is here. */
export function sandboxMatch(): MatchState {
  return {
    mode: "sandbox",
    preset: null,
    phase: "plan",
    round: 0,
    roundsTotal: 0,
    daysPerRound: 0,
    ready: [],
    history: [],
    goals: [],
    event: null,
    mods: { ...NO_MODS },
    perks: { ...NO_MODS },
    score: 0,
    startedAt: 0,
    roundBuilders: [],
    options: { ...DEFAULT_MATCH_OPTIONS },
    roles: {},
    wallets: {},
    secret: {},
    vip: null,
    vipHistory: [],
    duelGuests: {},
  };
}

/** The save shape. 3: upgrades count from 0, matches. */
export const SAVE_VERSION = 3;

export const DEFAULT_WEATHER: WeatherState = {
  kind: "sun",
  tempC: -6,
  snowQuality: 0.86,
  live: false,
  label: "Klar, Pulver",
};

/** Steps of the first-game tutorial: lift up, run down, guests ride. */
export const TUTORIAL_STEPS = 3;

export function emptyResort(roomId = "zermatt", region: string = CLASSIC_REGION): ResortState {
  return {
    version: SAVE_VERSION,
    roomId,
    resortName: REGION_BY_ID[region]?.name ?? "Alpina",
    region,
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
    match: sandboxMatch(),
    hallOfFame: [],
    chat: [],
    research: emptyResearch(),
  };
}

/** The three piste items that became one, and the grade each of them was. */
const RETIRED_PISTE_IDS: Record<string, PisteDifficulty> = {
  "piste-blue": "blue",
  "piste-red": "red",
  "piste-black": "black",
};

/**
 * Fold the old blue/red/black items into the single piste.
 *
 * A save written before the change points at item ids that no longer exist, so
 * `BY_ID[itemId]` would come back undefined and take the sim down with it. The
 * grade the player already built is kept — it was true of that ground then and
 * is true of it now — so nothing is regraded behind their back.
 */
function migratePiste(piste: PlacedPiste): PlacedPiste {
  const wasGrade = RETIRED_PISTE_IDS[piste.itemId];
  if (!wasGrade) return piste;
  return { ...piste, itemId: "piste", difficulty: piste.difficulty ?? wasGrade };
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
  // Before version 3 every upgrade track started at 1, which gave each lift a
  // free +38 % and made the first paid step unreachable.
  const shiftUpgrades = (snapshot.version ?? 1) < 3;
  const shift = <T extends { upgrades: Upgrades }>(e: T): T =>
    shiftUpgrades
      ? {
          ...e,
          upgrades: {
            speed: Math.max(0, (e.upgrades?.speed ?? 1) - 1),
            cabins: Math.max(0, (e.upgrades?.cabins ?? 1) - 1),
            capacity: Math.max(0, (e.upgrades?.capacity ?? 1) - 1),
          },
        }
      : e;
  const match = snapshot.match
    ? {
        ...base.match,
        ...snapshot.match,
        mods: { ...NO_MODS, ...snapshot.match.mods },
        perks: { ...NO_MODS, ...snapshot.match.perks },
      }
    : base.match;
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
    buildings: (snapshot.buildings ?? []).map(shift),
    lifts: (snapshot.lifts ?? []).map(shift),
    pistes: (snapshot.pistes ?? []).map(migratePiste),
    flow: snapshot.flow ?? [],
    unlocked: snapshot.unlocked ?? [],
    contributors: snapshot.contributors ?? {},
    activity: snapshot.activity ?? [],
    match: {
      ...match,
      roundBuilders: match.roundBuilders ?? [],
      options: { ...DEFAULT_MATCH_OPTIONS, ...(match.options ?? {}) },
      roles: match.roles ?? {},
      wallets: match.wallets ?? {},
      secret: match.secret ?? {},
      vip: match.vip ?? null,
      vipHistory: match.vipHistory ?? [],
      duelGuests: match.duelGuests ?? {},
    },
    research: { ...emptyResearch(), ...(snapshot.research ?? {}) },
    hallOfFame: snapshot.hallOfFame ?? [],
    chat: snapshot.chat ?? [],
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
    state.lifts.find((l) => l.stationA === id || l.stationB === id || l.stationMid === id);
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
  const grown =
    entity.kind === "building" ? expansionSpent(entity.building) : entity.kind === "piste" ? pisteExpansionSpent(entity.piste) : 0;
  // A lift's middle station was paid on top of the lift.
  const mid = entity.kind === "lift" && entity.lift.mid ? Math.round(item.cost * ECONOMY.midStationShare) : 0;
  return { coins: item.cost * segments + grown + mid, gems: (item.gemCost ?? 0) * segments };
}

/**
 * Whether the actor may still take this back for the full price: their own
 * build, within ECONOMY.undoSeconds — or, in a match, anything still waiting
 * for the round to end.
 */
export function undoable(state: ResortState, entity: ResortEntity, actorId: string | undefined, now: number): boolean {
  const e = entity.kind === "lift" ? entity.lift : entity.kind === "building" ? entity.building : entity.piste;
  if (e.builtBy && actorId && e.builtBy !== actorId) return false;
  if (state.match?.mode === "match" && e.readyAt >= Number.MAX_SAFE_INTEGER) return true;
  return now - e.builtAt <= ECONOMY.undoSeconds * 1000;
}

/** What moving a building costs, before research discounts. */
export function moveCost(state: Pick<ResortState, "research" | "match">, itemId: string): number {
  void state;
  return Math.round((BY_ID[itemId as keyof typeof BY_ID]?.cost ?? 0) * ECONOMY.moveCostShare);
}

/** Whether a building can be expanded: everything but lift stations and plain decoration. */
export function expandable(itemId: string): boolean {
  const item = BY_ID[itemId as keyof typeof BY_ID];
  if (!item || item.category === "lifts" || item.category === "pistes") return false;
  return itemId !== "road" && !BUILDING_LEVELS.fixed.includes(itemId);
}

/** Whether a run can be expanded: any piste or park, not a road. */
export function pisteExpandable(p: Pick<PlacedPiste, "difficulty">): boolean {
  return p.difficulty !== "road";
}

const clampLevel = (level: number | undefined, max: number) => Math.max(1, Math.min(max, level ?? 1));

/** A building's level, 1 for anything that cannot grow. */
export function buildingLevel(b: Pick<PlacedBuilding, "itemId" | "level">): number {
  return expandable(b.itemId) ? clampLevel(b.level, BUILDING_LEVELS.maxLevel) : 1;
}

/** A run's level; older saves have none, which is 1. */
export function pisteLevel(p: Pick<PlacedPiste, "difficulty" | "level">): number {
  return pisteExpandable(p) ? clampLevel(p.level, PISTE_LEVELS.maxLevel) : 1;
}

/** List price of a building's next level, or null when there is none. */
export function expansionCost(b: Pick<PlacedBuilding, "itemId" | "level">): number | null {
  if (!expandable(b.itemId)) return null;
  const level = buildingLevel(b);
  const share = BUILDING_LEVELS.costShare[level - 1];
  if (level >= BUILDING_LEVELS.maxLevel || share === undefined) return null;
  return Math.round(BY_ID[b.itemId].cost * share);
}

/** What a building's levels so far cost, at list price: part of what a refund returns. */
export function expansionSpent(b: Pick<PlacedBuilding, "itemId" | "level">): number {
  let total = 0;
  for (let l = 1; l < buildingLevel(b); l++) {
    total += Math.round(BY_ID[b.itemId].cost * (BUILDING_LEVELS.costShare[l - 1] ?? 0));
  }
  return total;
}

const segmentsOf = (p: Pick<PlacedPiste, "hexes">) => Math.max(1, p.hexes.length - 1);

/** List price of a run's next level, or null when there is none. */
export function pisteExpansionCost(p: Pick<PlacedPiste, "difficulty" | "level" | "hexes">): number | null {
  if (!pisteExpandable(p)) return null;
  const level = pisteLevel(p);
  const per = PISTE_LEVELS.costPerSegment[level - 1];
  if (level >= PISTE_LEVELS.maxLevel || per === undefined) return null;
  return per * segmentsOf(p);
}

/** What a run's levels so far cost, at list price. */
export function pisteExpansionSpent(p: Pick<PlacedPiste, "difficulty" | "level" | "hexes">): number {
  let total = 0;
  for (let l = 1; l < pisteLevel(p); l++) total += (PISTE_LEVELS.costPerSegment[l - 1] ?? 0) * segmentsOf(p);
  return total;
}

type Leveled = Pick<PlacedBuilding, "itemId" | "level">;
/** Arrivals, seats and shop customers, as a multiple of level 1. */
export const capacityFactor = (b: Leveled) => 1 + (buildingLevel(b) - 1) * BUILDING_LEVELS.capacityPerLevel;
/** Hotel beds, as a multiple of level 1. */
export const bedsFactor = (b: Leveled) => 1 + (buildingLevel(b) - 1) * BUILDING_LEVELS.bedsPerLevel;
/** Comfort, summer draw and the service bonuses, as a multiple of level 1. */
export const bonusFactor = (b: Leveled) => 1 + (buildingLevel(b) - 1) * BUILDING_LEVELS.bonusPerLevel;
/** A workshop's upkeep cut, as a multiple of level 1. */
export const cutFactor = (b: Leveled) => 1 + (buildingLevel(b) - 1) * BUILDING_LEVELS.cutPerLevel;
/** Upkeep of a building at its level, as a multiple of the catalogue value. */
export const upkeepFactor = (b: Leveled) => 1 + (buildingLevel(b) - 1) * BUILDING_LEVELS.upkeepPerLevel;
/** Upkeep of a run at its level, as a multiple of a level-1 run. */
export const pisteUpkeepFactor = (p: Pick<PlacedPiste, "difficulty" | "level">) =>
  1 + (pisteLevel(p) - 1) * PISTE_LEVELS.upkeepPerLevel;

export function occupiedSet(state: ResortState): Set<string> {
  const set = new Set<string>();
  for (const b of state.buildings) set.add(`${b.q},${b.r}`);
  for (const l of state.lifts) {
    set.add(`${l.a.q},${l.a.r}`);
    set.add(`${l.b.q},${l.b.r}`);
    if (l.mid) set.add(`${l.mid.q},${l.mid.r}`);
  }
  return set;
}
