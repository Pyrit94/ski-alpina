import type { ItemId } from "../../config/src/ids.ts";
import type { Axial } from "./hex.ts";

export type MapLayer = "3d" | "height" | "pistes" | "heat";
export type Tool = "select" | "pan" | "orbit";
export type WeatherKind = "sun" | "cloud" | "snow" | "fog" | "storm";
export type PisteDifficulty = "blue" | "red" | "black" | "park" | "road";
export type BuildPhase = "idle" | "place" | "lift-a" | "lift-b" | "piste";
export type HudSheet = "none" | "build" | "info" | "quests" | "menu";
export type PlayerRole = "builder" | "visitor";

export interface Upgrades {
  speed: number;
  cabins: number;
  capacity: number;
}

export interface PlacedBuilding {
  id: string;
  itemId: ItemId;
  q: number;
  r: number;
  level: number;
  builtAt: number;
  readyAt: number;
  upgrades: Upgrades;
  /** Player id of whoever put it here. Absent on anything built before this. */
  builtBy?: string;
}

export interface PlacedLift {
  id: string;
  itemId: ItemId;
  a: Axial;
  b: Axial;
  stationA: string;
  stationB: string;
  level: number;
  builtAt: number;
  readyAt: number;
  upgrades: Upgrades;
  builtBy?: string;
}

export interface PlacedPiste {
  id: string;
  itemId: ItemId;
  difficulty: PisteDifficulty;
  hexes: Axial[];
  builtAt: number;
  readyAt: number;
  builtBy?: string;
}

export interface QuestState {
  id: string;
  title: string;
  hint: string;
  xp: number;
  coins: number;
  gems: number;
  progress: number;
  target: number;
  claimed: boolean;
  /** Times a standing contract has been completed. 0 on a one-shot goal. */
  tier: number;
}

export interface WeatherState {
  kind: WeatherKind;
  tempC: number;
  snowQuality: number;
  live: boolean;
  label: string;
}

export interface SimStats {
  peoplePerHour: number;
  satisfaction: number;
  /** Net of upkeep: what actually lands in the account. */
  incomePerHour: number;
  /** Gross takings from tickets, beds, food and retail. */
  revenuePerHour: number;
  /** Running cost of everything built, paid whether guests come or not. */
  upkeepPerHour: number;
  visitorsToday: number;
  visitorsTotal: number;
  occupancy: number;
  waitMinutes: number;
  pisteKm: number;
  beds: number;
  liftCapacity: number;
  /** Demand the network could not route, in people per hour. */
  queued: number;
  /** People per hour offered to the resort, before any capacity limit. */
  demandPerHour: number;
  /** Ready lifts carrying nobody — built, but joined to nothing that works. */
  idleLifts: number;
  /** Ready pistes carrying nobody. */
  idlePistes: number;
  /** Metres of vertical transported per hour: the resort's true size. */
  verticalPerHour: number;
  /** Busiest saturated edge, or "" when nothing is near its limit. */
  bottleneckLabel: string;
  /** Entity id behind `bottleneckLabel`, for highlighting it on the map. */
  bottleneckId: string;
  /** Utilisation of that edge, 0..1. */
  bottleneckUse: number;
  /**
   * Height in metres above which there is snow today, snowmaking included.
   *
   * A run whose bottom sits under this loses the bare part of itself, so this
   * is the number that decides whether a low valley run is open.
   */
  snowLineM: number;
  /** Ready pistes closed outright for want of snow. */
  closedPistes: number;
}

export interface FlowEdgeViz {
  id: string;
  kind: "lift" | "piste";
  from: Axial;
  to: Axial;
  flow: number;
  capacity: number;
  path?: Axial[];
}

export interface PlayerPresence {
  id: string;
  name: string;
  role: PlayerRole;
  lastSeen: number;
  /**
   * The hex this player is pointing at, when they are.
   *
   * Two people building one resort could not see each other work: the only
   * sign of company was a number in the corner. This is what puts the other
   * person on the mountain.
   */
  focus?: Axial | null;
}

/** What one player has put into the resort. Survives them leaving the room. */
export interface Contributor {
  name: string;
  builds: number;
  demolished: number;
  coinsSpent: number;
}

/**
 * One thing that happened, kept in the save.
 *
 * Events used to be broadcast and forgotten, so someone coming back had no
 * way to see what changed while they were away — and no event said who did it.
 */
export interface ActivityEntry {
  id: string;
  at: number;
  /** Player id, or "" for something the simulation did. */
  actor: string;
  actorName: string;
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
}

export interface ResortState {
  version: number;
  roomId: string;
  resortName: string;
  coins: number;
  gems: number;
  stars: number;
  xp: number;
  season: number;
  day: number;
  timeOfDay: number;
  ticketPrice: number;
  buildings: PlacedBuilding[];
  lifts: PlacedLift[];
  pistes: PlacedPiste[];
  quests: QuestState[];
  tutorialStep: number;
  tutorialOpen: boolean;
  weather: WeatherState;
  stats: SimStats;
  flow: FlowEdgeViz[];
  unlocked: ItemId[];
  /**
   * What each player has put in, keyed by player id.
   *
   * Persisted with the resort so a name survives its owner's session — an
   * entity's `builtBy` would otherwise become an unresolvable id after a
   * restart.
   */
  contributors: Record<string, Contributor>;
  /** Newest first, bounded. */
  activity: ActivityEntry[];
}

export interface IntentError {
  ok: false;
  code: "invalid" | "budget" | "terrain" | "collision" | "slope" | "rights" | "locked";
  reason: string;
}

export interface IntentOk {
  ok: true;
}

export type IntentResult = IntentOk | IntentError;
