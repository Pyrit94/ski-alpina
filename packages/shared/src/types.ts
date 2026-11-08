import type { ItemId } from "../../config/src/ids.ts";
import type { Axial } from "./hex.ts";

export type MapLayer = "3d" | "height" | "pistes" | "heat";
export type Tool = "select" | "pan" | "orbit";
export type WeatherKind = "sun" | "cloud" | "snow" | "fog" | "storm";
export type PisteDifficulty = "blue" | "red" | "black" | "park" | "road";
export type BuildPhase = "idle" | "place" | "lift-a" | "lift-b" | "piste";
export type HudSheet = "none" | "build" | "info" | "quests" | "menu" | "chat" | "research";
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
  /** A name the players gave it, e.g. "Sunnegga-Express". */
  name?: string;
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

/** 1 schmal, 2 normal, 3 breit. Older saves have none, which means 2. */
export type PisteWidth = 1 | 2 | 3;

export interface PlacedPiste {
  id: string;
  itemId: ItemId;
  difficulty: PisteDifficulty;
  hexes: Axial[];
  builtAt: number;
  readyAt: number;
  builtBy?: string;
  /** Width class of the run; see PISTE_WIDTHS in config. Absent = 2. */
  width?: PisteWidth;
  /** A name the players gave the run, e.g. "Matterhorn-Abfahrt". */
  name?: string;
  /** Expansion level, see PISTE_LEVELS. Absent = 1. */
  level?: number;
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
  /** Guests per hour who wanted to come but found no way in (parking, bus, beds). */
  turnedAway: number;
  /** Guests per hour the mountain draws, before any capacity limit. */
  marketPerHour: number;
  /** Guests (not rides) per hour at the current rate. */
  guestsPerHour: number;
  /** Demand multiplier of the opening season; 1 once it is over. */
  openingBoost?: number;
}

export interface FlowEdgeViz {
  id: string;
  /**
   * "building": a car park, bus station or hotel (arrivals), a restaurant or
   * shop (guests served) or a ticket office (extra takings, `unit` "chf").
   */
  kind: "lift" | "piste" | "building";
  /** What `flow` and `capacity` count. Absent: rides per hour. */
  unit?: "arrivals" | "served" | "chf";
  from: Axial;
  to: Axial;
  flow: number;
  capacity: number;
  path?: Axial[];
  /**
   * How the layout joins this edge, regardless of today's traffic: a lift
   * with no run from its top, a run that ends nowhere. Absent on old saves.
   */
  link?: "ok" | "no-descent" | "no-access" | "dead-end" | "unreached";
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
  /** A marker this player put on the map for the others, while it is fresh. */
  mark?: MapMark | null;
}

export type MarkKind = "look" | "build" | "warn";

/** "Look here": a short-lived pointer one player leaves for the other. */
export interface MapMark {
  hex: Axial;
  kind: MarkKind;
  at: number;
}

/** One line of team chat. */
export interface ChatEntry {
  id: string;
  at: number;
  actor: string;
  actorName: string;
  text: string;
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
  /** Which map this resort is built on (config/regions.ts); absent: the classic valley. */
  region?: string;
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
  /** Free play, or a match of a fixed number of rounds. */
  match: MatchState;
  /** Finished matches in this room, best first. Survives starting a new one. */
  hallOfFame: MatchResult[];
  /** Team chat, oldest first, bounded. */
  chat: ChatEntry[];
  research: ResearchState;
  /** Free-play speed: 0 paused, 1 normal, 3 fast. Absent = 1. */
  speed?: number;
  /** One line per finished day, oldest first, bounded (ECONOMY.historyDays). */
  daily?: DailyRecord[];
  /** What today has earned so far, for the next DailyRecord. */
  todayIncome?: number;
}

/** A finished day, for the charts in Betrieb. */
export interface DailyRecord {
  season: number;
  day: number;
  guests: number;
  income: number;
  satisfaction: number;
}

/**
 * Multipliers a round's event (or a permanent perk) puts on the simulation.
 * 1 is neutral for the factors, 0 for `snow`.
 */
export interface RoundModifiers {
  demand: number;
  /** Added to the day's snow quality, -1..1. */
  snow: number;
  wait: number;
  upkeep: number;
  ticket: number;
  /** Grades closed for the round, e.g. black runs after an avalanche warning. */
  closed: PisteDifficulty[];
}

export type MatchPreset = "kurz" | "normal" | "lang";
export type Medal = "gold" | "silber" | "bronze";

/** What one round of a match produced. */
export interface RoundReport {
  round: number;
  season: number;
  dayFrom: number;
  dayTo: number;
  guests: number;
  revenue: number;
  upkeep: number;
  net: number;
  satisfaction: number;
  /** Weather kinds over the round, one per day. */
  weather: WeatherKind[];
  closedPistes: number;
  bottleneck: string;
  coinsAfter: number;
  /** Medal reached at a season's end, if this round closed one. */
  medal?: Medal | null;
  event?: string;
  /** Who decided the round's event. */
  eventBy?: string;
  /** Both (all) players built something this round, and earned the bonus. */
  teamwork?: boolean;
  /** A VIP wish settled this round. */
  vip?: { name: string; status: "done" | "failed" };
  /** The event was settled as a compromise of both options. */
  compromise?: boolean;
  /** Duel: each player's purse after the round. */
  wallets?: Record<string, number>;
  /** Research points earned over the round. */
  research?: number;
}

/** A decision put to the players at the start of a round. */
export interface PendingEvent {
  id: string;
  title: string;
  body: string;
  options: { label: string; detail: string; cost?: number }[];
  /** Index of the chosen option, null while undecided. */
  chosen: number | null;
  /** Who decided it. */
  chosenBy?: string;
  /** With voting on: each player's choice so far. */
  votes?: Record<string, number>;
  /** The players disagreed, so both options apply at half strength. */
  compromise?: boolean;
}

/** How money is held in a match. */
export type EconomyMode = "shared" | "roles" | "duel";
/** How round events are decided. */
export type EventMode = "off" | "first" | "vote";
/** In "roles": the mountain (lifts, pistes, snow) or the valley (hotels, food, services). */
export type TeamRole = "berg" | "tal";

/**
 * The rules of a match. Chosen when it starts; everything except `economy`
 * can be changed between rounds and applies from the next round on.
 */
export interface MatchOptions {
  economy: EconomyMode;
  /** With "roles": percent of the income that goes to the mountain role. */
  roleSplit: number;
  events: EventMode;
  secretGoals: boolean;
  vips: boolean;
  album: boolean;
  research: boolean;
  teamwork: boolean;
}

/** A VIP guest's wish: fulfil it by a round for a reward. */
export interface VipRequest {
  id: string;
  name: string;
  wish: string;
  /** Last round in which it can be fulfilled. */
  dueRound: number;
  rewardCoins: number;
  rewardStars: number;
  /** Set when the round resolution checked it. */
  status: "open" | "done" | "failed";
}

/** Research: what is finished, what runs, and the points to pay for it. */
export interface ResearchState {
  /** Finished node ids. */
  done: string[];
  /** The node being researched and the points already in it. */
  active: { id: string; progress: number } | null;
  /** Points banked and not yet spent. */
  points: number;
  /** Alliance nodes need every player's pledge before they can start. */
  pledges: Record<string, string[]>;
  /** Nodes waiting to start once the running one is finished. */
  queue: string[];
}

export interface SeasonGoal {
  season: number;
  /** Guests over the season needed for each medal. */
  bronze: number;
  silber: number;
  gold: number;
  /** Guests so far this season. */
  guests: number;
  medal: Medal | null;
}

export interface MatchState {
  mode: "sandbox" | "match";
  preset: MatchPreset | null;
  phase: "plan" | "finished";
  round: number;
  roundsTotal: number;
  daysPerRound: number;
  /** Player ids who pressed "Runde beenden". */
  ready: string[];
  history: RoundReport[];
  goals: SeasonGoal[];
  event: PendingEvent | null;
  /** This round's effects. */
  mods: RoundModifiers;
  /** Effects for the rest of the match. */
  perks: RoundModifiers;
  score: number;
  startedAt: number;
  /** Player ids who built something in the current round. */
  roundBuilders: string[];
  options: MatchOptions;
  /** Roles in "roles" mode, by player id. */
  roles: Record<string, TeamRole>;
  /** Separate purses in "roles" and "duel" mode, by player id. */
  wallets: Record<string, number>;
  /** One secret goal id per player, when secret goals are on. */
  secret: Record<string, string>;
  /** The current VIP wish, if any, and the ones already settled. */
  vip: VipRequest | null;
  vipHistory: VipRequest[];
  /** Duel: guests each player's lifts carried over the match. */
  duelGuests: Record<string, number>;
}

export interface MatchResult {
  preset: MatchPreset;
  score: number;
  medals: Medal[];
  guests: number;
  players: string[];
  resortName: string;
  finishedAt: number;
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
