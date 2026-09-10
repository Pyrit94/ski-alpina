export type Category = "lifts" | "buildings" | "pistes" | "deco" | "services";

export type ItemId =
  | "tbar"
  | "chair"
  | "gondola"
  | "tram"
  | "restaurant"
  | "hut"
  | "hotel1"
  | "hotel3"
  | "hotel5"
  | "shop"
  | "skischool"
  | "ticket"
  | "apres"
  | "spa"
  | "piste-blue"
  | "piste-red"
  | "piste-black"
  | "snowpark"
  | "road"
  | "tree"
  | "rock"
  | "viewpoint"
  | "lights"
  | "snowmaker"
  | "groomer"
  | "workshop"
  | "parking"
  | "clinic"
  | "bus";

export type MapLayer = "3d" | "height" | "pistes" | "heat";
export type Tool = "select" | "pan" | "orbit";
export type WeatherKind = "sun" | "cloud" | "snow" | "fog" | "storm";
export type PisteDifficulty = "blue" | "red" | "black" | "park";
export type BuildPhase = "idle" | "place" | "lift-a" | "lift-b" | "piste";
export type HudSheet = "none" | "build" | "info" | "quests" | "menu";

export interface CatalogItem {
  id: ItemId;
  category: Category;
  name: string;
  blurb: string;
  cost: number;
  gemCost?: number;
  xp: number;
  unlockLevel: number;
  buildSeconds: number;
  footprint: number;
  maxSlope: number;
  minElev: number;
  maxElev: number;
  capacity?: number;
  beds?: number;
  speed?: number;
  minSpan?: number;
  maxSpan?: number;
  color: string;
}

export interface PlacedBuilding {
  id: string;
  itemId: ItemId;
  q: number;
  r: number;
  level: number;
  builtAt: number;
  readyAt: number;
  upgrades: {
    speed: number;
    cabins: number;
    capacity: number;
  };
}

export interface PlacedLift {
  id: string;
  itemId: ItemId;
  a: { q: number; r: number };
  b: { q: number; r: number };
  stationA: string;
  stationB: string;
  level: number;
  builtAt: number;
  readyAt: number;
  upgrades: {
    speed: number;
    cabins: number;
    capacity: number;
  };
}

export interface PlacedPiste {
  id: string;
  difficulty: PisteDifficulty;
  hexes: { q: number; r: number }[];
  builtAt: number;
  readyAt: number;
}

export interface Quest {
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

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
  at: number;
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
}

export interface GameSave {
  version: number;
  resortName: string;
  coins: number;
  gems: number;
  stars: number;
  xp: number;
  season: number;
  day: number;
  timeOfDay: number;
  buildings: PlacedBuilding[];
  lifts: PlacedLift[];
  pistes: PlacedPiste[];
  quests: Quest[];
  tutorialStep: number;
  tutorialOpen: boolean;
  weather: WeatherState;
  stats: SimStats;
  unlocked: ItemId[];
}

export interface UpgradeDef {
  key: "speed" | "cabins" | "capacity";
  label: string;
  max: number;
  cost: number[];
}
