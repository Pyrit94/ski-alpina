export { HEX_SIZE, HEX_DIRS, hexKey, hexToWorld, worldToHex, hexDistance, hexLine, hexesInRange } from "./hex.ts";
export type { Axial } from "./hex.ts";
export { createId } from "./ids.ts";
export type {
  MapLayer,
  Tool,
  WeatherKind,
  PisteDifficulty,
  BuildPhase,
  HudSheet,
  PlayerRole,
  Upgrades,
  PlacedBuilding,
  PlacedLift,
  PlacedPiste,
  QuestState,
  WeatherState,
  SimStats,
  FlowEdgeViz,
  PlayerPresence,
  ResortState,
  IntentResult,
} from "./types.ts";
export { IntentSchema, ClientMessageSchema, ServerMessageSchema, ItemIdSchema, AxialSchema } from "./protocol/intents.ts";
export type { Intent, ClientMessage, ServerMessage } from "./protocol/intents.ts";
export { generateDem, getDem, encodeTerrainRgb, decodeTerrainRgbSample } from "./terrain/dem.ts";
export type { Dem } from "./terrain/dem.ts";
export { xpForLevel, levelFromXp, liftThroughput, pisteDifficulty } from "./engine/level.ts";
export { DEFAULT_STATS, DEFAULT_WEATHER, emptyResort, migrateResort, occupiedSet } from "./engine/state.ts";
export { validateHex, validateIntent } from "./engine/validate.ts";
export { applyIntent } from "./engine/apply.ts";
export type { Applied } from "./engine/apply.ts";
export { tickFlow, nearestStation, worldElev } from "./engine/flow.ts";
export { buildResortGraph, clusterPorts, VILLAGE_HEX } from "./engine/graph.ts";
export type { DemandSource, GraphInput, LiftEdge, PisteEdge, ResortGraph } from "./engine/graph.ts";
export { FlowNetwork, UNCAPPED } from "./engine/maxflow.ts";
export { tickResort } from "./engine/tick.ts";
export { syncQuestProgress } from "./engine/quests.ts";
export { GameRoom, TICK_MS, PERSIST_MS } from "./runtime/room.ts";
export type { RoomPlayer, RoomEvent } from "./runtime/room.ts";
