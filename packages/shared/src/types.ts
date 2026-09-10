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
}

export interface PlacedPiste {
  id: string;
  itemId: ItemId;
  difficulty: PisteDifficulty;
  hexes: Axial[];
  builtAt: number;
  readyAt: number;
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
  incomePerHour: number;
  visitorsToday: number;
  visitorsTotal: number;
  occupancy: number;
  waitMinutes: number;
  pisteKm: number;
  beds: number;
  liftCapacity: number;
  queued: number;
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
