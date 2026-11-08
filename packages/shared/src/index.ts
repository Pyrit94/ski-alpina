export { HEX_SIZE, HEX_DIRS, hexKey, hexToWorld, worldToHex, hexDistance, hexLine, hexesInRange } from "./hex.ts";
export type { Axial } from "./hex.ts";
export { createId } from "./ids.ts";
export type {
  Proposal,
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
  MatchState,
  MatchResult,
  MatchPreset,
  Medal,
  PendingEvent,
  RoundModifiers,
  RoundReport,
  SeasonGoal,
  ChatEntry,
  MapMark,
  MarkKind,
  PisteWidth,
  EconomyMode,
  EventMode,
  TeamRole,
  MatchOptions,
  VipRequest,
  ResearchState,
} from "./types.ts";
export { MAX_PISTE_HEXES, IntentSchema, ClientMessageSchema, ServerMessageSchema, ItemIdSchema, AxialSchema } from "./protocol/intents.ts";
export type { Intent, ClientMessage, ServerMessage } from "./protocol/intents.ts";
export { generateDem, getDem, encodeTerrainRgb, decodeTerrainRgbSample, knownRegion, loadAllRegions, loadRegion, regionPoint, setActiveRegion } from "./terrain/dem.ts";
export type { Dem, RegionGeo } from "./terrain/dem.ts";
export {
  xpForLevel,
  levelFromXp,
  liftThroughput,
  pisteDifficulty,
  pisteCapacity,
  pisteUpkeep,
  gradeForSlope,
  gradeBand,
  measurePiste,
  GRADE_LABEL,
} from "./engine/level.ts";
export {
  DEFAULT_STATS,
  DEFAULT_WEATHER,
  DEFAULT_MATCH_OPTIONS,
  emptyResearch,
  emptyResort,
  TUTORIAL_STEPS,
  entityCost,
  expandable,
  expansionCost,
  expansionSpent,
  pisteExpandable,
  pisteExpansionCost,
  pisteExpansionSpent,
  buildingLevel,
  pisteLevel,
  capacityFactor,
  bedsFactor,
  bonusFactor,
  cutFactor,
  upkeepFactor,
  pisteUpkeepFactor,
  findEntity,
  migrateResort,
  occupiedSet,
} from "./engine/state.ts";
export type { ResortEntity } from "./engine/state.ts";
export {
  validateHex,
  validateIntent,
  validatePistePath,
  validateGround,
  checkRearrange,
  surveyPiste,
  pisteCost,
} from "./engine/validate.ts";
export { routePiste, segmentGrades } from "./engine/piste-route.ts";
export type { RouteOptions, RouteTarget } from "./engine/piste-route.ts";
export { extendDraft, pisteAnchors, pisteLinks, snapPisteStart } from "./engine/piste-draft.ts";
export type { Anchor, AnchorKind, DraftStep, PisteLinks } from "./engine/piste-draft.ts";
export { pistePriceAt, widthChangePrice } from "./engine/piste-edit.ts";
export { pisteWidthDraw, widthDef, widthOf } from "./engine/piste-width.ts";
export type { PisteWidthDef } from "./engine/piste-width.ts";
export { applyIntent } from "./engine/apply.ts";
export type { Applied } from "./engine/apply.ts";
export { tickFlow, nearestStation, worldElev } from "./engine/flow.ts";
export { buildResortGraph, clusterPorts, junctionsOn, pisteUse, villageReaches, VILLAGE_HEX } from "./engine/graph.ts";
export type { LiftLink, PisteLink } from "./engine/graph.ts";
export { descentGoals, liftEnds, resortLinks, suggestDescent } from "./engine/descent.ts";
export { planAutoPistes } from "./engine/auto-pistes.ts";
export { siteAt, siteContext, siteFactors, siteImpact, siteKind, villageMovable } from "./engine/site.ts";
export type { SiteContext, SiteEffect, SiteImpact, SiteKind, SiteReport } from "./engine/site.ts";
export { planVillage } from "./engine/village.ts";
export { withEdits } from "./terrain/edits.ts";
export type { TerrainEdits } from "./terrain/edits.ts";
export { validateLevel } from "./engine/terraform.ts";
export { accessAt, accessNeed, onPiste, onRoad } from "./engine/access.ts";
export { bestReshape, reshapeAll } from "./engine/piste-reshape.ts";
export type { Reshape } from "./engine/piste-reshape.ts";
export { countSwings, pistePoints, relaxLine, scorePiste, starsFor } from "./engine/piste-score.ts";
export type { PisteScore } from "./engine/piste-score.ts";
export { costOf, parseCarried, proposalLimit } from "./engine/proposals.ts";
export type { VillageMove, VillagePlan } from "./engine/village.ts";
export type { AutoMix, AutoOutlook, AutoPlan, AutoResult } from "./engine/auto-pistes.ts";
export type { EdgeLink } from "./engine/descent.ts";
export type { DemandSource, GraphInput, LiftEdge, PisteEdge, ResortGraph } from "./engine/graph.ts";
export { FlowNetwork, UNCAPPED } from "./engine/maxflow.ts";
export { tickResort } from "./engine/tick.ts";
export {
  PENDING_READY,
  applyEventChoice,
  assetValue,
  drawEvent,
  eventDef,
  inMatch,
  resolveRound,
  roundsPerSeason,
  scoreBreakdown,
  startMatch,
  startSandbox,
  withPreview,
} from "./engine/match.ts";
export type { ScoreBreakdown, DuelScore } from "./engine/match.ts";
export { duelScores, ensureMatchPlayers } from "./engine/match.ts";
export {
  conditionsMet,
  conditionsProgress,
  metric,
  roleAllows,
  roleForItem,
  secretGoalResults,
  spendable,
  walletKey,
  walletMode,
} from "./engine/rules.ts";
export { activeModifiers, NEUTRAL_MODS } from "./engine/flow.ts";
export { syncQuestProgress } from "./engine/quests.ts";
export {
  naturalSnowLine,
  pisteSnowScale,
  seasonDemandShare,
  seasonPhase,
  snowLine,
  SEASON_LABEL,
} from "./engine/season.ts";
export type { SeasonPhase } from "./engine/season.ts";
export { weatherForDay } from "./engine/weather.ts";
export { GameRoom, TICK_MS, PERSIST_MS, MARK_TTL_MS, CHAT_LIMIT } from "./runtime/room.ts";
export type { RoomPlayer, RoomEvent } from "./runtime/room.ts";
export { defaultSaveName, SAVE_NAME_MAX, GAME_NAME_MAX } from "./runtime/saves.ts";
export type { GameInfo, GameKind, SaveInfo, SaveSummary } from "./runtime/saves.ts";
export {
  researchEffects,
  researchEnabled,
  researchRate,
  researchTotal,
  buildCost,
  discounted,
  itemUnlocked,
  lockReason,
  isAllianceNode,
  missingPledges,
  nodeStatus,
  prerequisitesMet,
  validateResearch,
  NO_RESEARCH_EFFECTS,
} from "./engine/research.ts";
export type { NodeStatus, ResearchContext, ResearchEffects } from "./engine/research.ts";
