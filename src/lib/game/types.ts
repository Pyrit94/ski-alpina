export type { Category, ItemId } from "@ski/config";
export type {
  MapLayer,
  Tool,
  WeatherKind,
  PisteDifficulty,
  BuildPhase,
  HudSheet,
  PlacedBuilding,
  PlacedLift,
  PlacedPiste,
  WeatherState,
  SimStats,
  ResortState as GameSave,
} from "@ski/shared";
export type { CatalogItem } from "@ski/config";
export type { QuestState as Quest } from "@ski/shared";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
  at: number;
}

export interface UpgradeDef {
  key: "speed" | "cabins" | "capacity";
  label: string;
  max: number;
  cost: number[];
}
