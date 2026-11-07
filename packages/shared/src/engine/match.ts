import { SEASON } from "../../../config/src/economy.ts";
import { isLift } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { EVENTS, MATCH, type EventDef, type MatchPresetId } from "../../../config/src/match.ts";
import type { Dem } from "../terrain/dem.ts";
import type {
  Medal,
  MatchState,
  PendingEvent,
  ResortState,
  RoundModifiers,
  RoundReport,
  SeasonGoal,
  WeatherKind,
} from "../types.ts";
import { tickFlow } from "./flow.ts";
import { syncQuestProgress } from "./quests.ts";
import { seasonPhase } from "./season.ts";
import { emptyResort, NO_MODS, sandboxMatch } from "./state.ts";
import { weatherForDay } from "./weather.ts";

/**
 * `readyAt` for anything built during a round's planning phase.
 *
 * In a match time does not run while people build, so construction finishes
 * when the round is played out rather than after some seconds of wall clock.
 * A large finite number rather than Infinity, which JSON cannot carry.
 */
export const PENDING_READY = Number.MAX_SAFE_INTEGER;

export function inMatch(state: ResortState): boolean {
  return state.match?.mode === "match";
}

/** Rounds in one match season. */
export function roundsPerSeason(daysPerRound: number = MATCH.daysPerRound): number {
  return Math.ceil(Math.min(MATCH.seasonDays, SEASON.daysPerYear) / daysPerRound);
}

/** Deterministic 0..1 from a few integers, so both players draw the same card. */
function hash01(a: number, b: number, c: number): number {
  let h = (a * 2_654_435_761) ^ (b * 1_597_334_677) ^ (c * 3_812_015_801);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  h = Math.imul(h ^ (h >>> 13), 3_266_489_917);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/**
 * The event put to the players this round, if any.
 *
 * Not every round: a decision each time would turn into noise. Round 1 is left
 * for building. Seeded by the match start so two matches play differently.
 */
export function drawEvent(match: Pick<MatchState, "round" | "startedAt">, day: number): PendingEvent | null {
  if (match.round <= 1) return null;
  const seed = Math.floor(match.startedAt / 1000) % 100_000;
  if (hash01(seed, match.round, 1) > 0.65) return null;
  const phase = seasonPhase(day);
  const pool = EVENTS.filter((e) => !e.phase || e.phase === phase);
  if (pool.length === 0) return null;
  const def = pool[Math.floor(hash01(seed, match.round, 2) * pool.length)]!;
  return toPending(def);
}

function toPending(def: EventDef): PendingEvent {
  return {
    id: def.id,
    title: def.title,
    body: def.body,
    options: def.options.map((o) => ({ label: o.label, detail: o.detail })),
    chosen: null,
  };
}

export function eventDef(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}

function goalsFor(seasons: number): SeasonGoal[] {
  return Array.from({ length: seasons }, (_, i) => {
    const scale = Math.pow(MATCH.goalGrowth, i);
    return {
      season: i + 1,
      bronze: Math.round(MATCH.goals.bronze * scale),
      silber: Math.round(MATCH.goals.silber * scale),
      gold: Math.round(MATCH.goals.gold * scale),
      guests: 0,
      medal: null,
    };
  });
}

/**
 * A fresh resort set up for a match.
 *
 * The room keeps its name, its hall of fame and whether the tutorial has been
 * seen; everything built is cleared, because a score only means something if
 * every match starts from the same empty valley.
 */
export function startMatch(state: ResortState, presetId: MatchPresetId, now: number, dem: Dem): ResortState {
  const preset = MATCH.presets.find((p) => p.id === presetId) ?? MATCH.presets[1]!;
  const base = emptyResort(state.roomId);
  const match: MatchState = {
    mode: "match",
    preset: preset.id,
    phase: "plan",
    round: 1,
    roundsTotal: preset.seasons * roundsPerSeason(),
    daysPerRound: MATCH.daysPerRound,
    ready: [],
    history: [],
    goals: goalsFor(preset.seasons),
    event: null,
    mods: { ...NO_MODS },
    perks: { ...NO_MODS },
    score: 0,
    startedAt: now,
  };
  const next: ResortState = {
    ...base,
    resortName: state.resortName,
    hallOfFame: state.hallOfFame,
    tutorialOpen: state.tutorialOpen,
    tutorialStep: state.tutorialStep,
    coins: preset.startingCoins,
    timeOfDay: 0.5,
    weather: weatherForDay(1, 1),
    match,
  };
  return withPreview(next, dem);
}

/** Back to free play, from an empty valley. */
export function startSandbox(state: ResortState): ResortState {
  const base = emptyResort(state.roomId);
  return {
    ...base,
    resortName: state.resortName,
    hallOfFame: state.hallOfFame,
    tutorialOpen: state.tutorialOpen,
    tutorialStep: state.tutorialStep,
    match: sandboxMatch(),
  };
}

/**
 * Stats as they will be once everything planned is built, at midday.
 *
 * During planning nothing runs, so without this a new lift would show no
 * effect until the round was over. Recomputing on every change gives the
 * immediate feedback a turn-based game lives on.
 */
export function withPreview(state: ResortState, dem: Dem): ResortState {
  const probe = { ...state, timeOfDay: 0.5 };
  const flowed = tickFlow(probe, dem, 0, PENDING_READY);
  return {
    ...state,
    stats: {
      ...flowed.stats,
      visitorsToday: state.stats.visitorsToday,
      visitorsTotal: state.stats.visitorsTotal,
    },
    flow: flowed.flow,
  };
}

/** Fold an event option's effect into the state. */
export function applyEventChoice(state: ResortState, option: number, actorId: string): ResortState {
  const match = state.match;
  const pending = match.event;
  if (!pending || pending.chosen !== null) return state;
  const def = eventDef(pending.id);
  const effect = def?.options[option]?.effect ?? {};
  const target: RoundModifiers = effect.lasting ? { ...match.perks } : { ...match.mods };
  target.demand *= effect.demand ?? 1;
  target.snow += effect.snow ?? 0;
  target.wait *= effect.wait ?? 1;
  target.upkeep *= effect.upkeep ?? 1;
  target.ticket *= effect.ticket ?? 1;
  target.closed = [...target.closed, ...(effect.closed ?? [])];
  return {
    ...state,
    coins: Math.max(0, state.coins + (effect.coins ?? 0)),
    stars: state.stars + (effect.stars ?? 0),
    match: {
      ...match,
      event: { ...pending, chosen: option, chosenBy: actorId },
      ...(effect.lasting ? { perks: target } : { mods: target }),
    },
  };
}

/** What is built, at build price. Stations ride along with their lift. */
export function assetValue(state: ResortState): number {
  let total = 0;
  for (const l of state.lifts) total += BY_ID[l.itemId]?.cost ?? 0;
  for (const b of state.buildings) if (!isLift(b.itemId)) total += BY_ID[b.itemId]?.cost ?? 0;
  for (const p of state.pistes) total += (BY_ID[p.itemId]?.cost ?? 0) * Math.max(1, p.hexes.length - 1);
  return total;
}

export interface ScoreBreakdown {
  cash: number;
  assets: number;
  guests: number;
  satisfaction: number;
  medals: number;
  total: number;
}

export function scoreBreakdown(state: ResortState): ScoreBreakdown {
  const s = MATCH.score;
  const history = state.match.history;
  const guests = history.reduce((n, r) => n + r.guests, 0);
  const avgSat = history.length ? history.reduce((n, r) => n + r.satisfaction, 0) / history.length : 0;
  const cash = Math.round((state.coins / 1000) * s.perThousandChf);
  const assets = Math.round(((assetValue(state) * s.assetShare) / 1000) * s.perThousandChf);
  const guestPts = Math.round((guests / 100) * s.perHundredGuests);
  const satPts = Math.round(avgSat * s.perSatisfaction);
  const medals = state.match.goals.reduce((n, g) => n + (g.medal ? s.medal[g.medal] : 0), 0);
  return {
    cash,
    assets,
    guests: guestPts,
    satisfaction: satPts,
    medals,
    total: cash + assets + guestPts + satPts + medals,
  };
}

function medalFor(goal: SeasonGoal): Medal | null {
  if (goal.guests >= goal.gold) return "gold";
  if (goal.guests >= goal.silber) return "silber";
  if (goal.guests >= goal.bronze) return "bronze";
  return null;
}

/**
 * Play one round out: `daysPerRound` days, `stepsPerDay` steps each.
 *
 * Deterministic for a given state, so the result does not depend on who
 * pressed the button last or how loaded the server is.
 */
export function resolveRound(input: ResortState, dem: Dem, now: number): ResortState {
  let state = input;
  const match0 = state.match;
  if (match0.mode !== "match" || match0.phase !== "plan") return state;

  // Nobody decided: the cautious option applies.
  if (match0.event && match0.event.chosen === null) {
    state = applyEventChoice(state, 1, "");
  }
  const eventTitle = state.match.event?.title;

  // Everything planned this round is finished now.
  const done = <T extends { readyAt: number }>(e: T): T => (e.readyAt > now ? { ...e, readyAt: now } : e);
  state = {
    ...state,
    buildings: state.buildings.map(done),
    lifts: state.lifts.map(done),
    pistes: state.pistes.map(done),
  };

  const steps = MATCH.stepsPerDay;
  const dt = 1 / steps;
  const dayFrom = state.day;
  const seasonAtStart = state.season;
  const weather: WeatherKind[] = [];
  const coinsBefore = state.coins;
  let guests = 0;
  let revenue = 0;
  let upkeep = 0;
  let satSum = 0;
  let closedMax = 0;
  const bottlenecks = new Map<string, number>();
  const goals = state.match.goals.map((g) => ({ ...g }));
  let medalThisRound: Medal | null = null;

  for (let d = 0; d < state.match.daysPerRound; d++) {
    weather.push(state.weather.kind);
    let guestsToday = 0;
    for (let k = 0; k < steps; k++) {
      const probe = { ...state, timeOfDay: (k + 0.5) / steps };
      const flowed = tickFlow(probe, dem, dt, now);
      state = {
        ...state,
        coins: Math.max(0, state.coins + flowed.coinsDelta),
        stats: flowed.stats,
        flow: flowed.flow,
      };
      const g = flowed.stats.guestsPerHour * dt;
      guests += g;
      guestsToday += g;
      revenue += flowed.stats.revenuePerHour * dt;
      upkeep += flowed.stats.upkeepPerHour * dt;
      satSum += flowed.stats.satisfaction;
      closedMax = Math.max(closedMax, flowed.stats.closedPistes);
      if (flowed.stats.bottleneckLabel) {
        bottlenecks.set(flowed.stats.bottleneckLabel, (bottlenecks.get(flowed.stats.bottleneckLabel) ?? 0) + 1);
      }
    }
    const goal = goals.find((x) => x.season === state.season);
    if (goal) goal.guests += guestsToday;

    // The next day, and possibly the next year.
    let day = state.day + 1;
    let season = state.season;
    // A match season ends with the thaw; the summer break is skipped.
    if (day > Math.min(MATCH.seasonDays, SEASON.daysPerYear)) {
      const closing = goals.find((x) => x.season === season);
      if (closing) {
        closing.medal = medalFor(closing);
        medalThisRound = closing.medal;
      }
      day = 1;
      season += 1;
    }
    state = syncQuestProgress({
      ...state,
      day,
      season,
      weather: weatherForDay(season, day),
      stats: { ...state.stats, visitorsToday: 0 },
    });
  }

  const samples = state.match.daysPerRound * steps;
  const bottleneck = [...bottlenecks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const report: RoundReport = {
    round: state.match.round,
    season: seasonAtStart,
    dayFrom,
    dayTo: dayFrom + state.match.daysPerRound - 1,
    guests: Math.round(guests),
    revenue: Math.round(revenue),
    upkeep: Math.round(upkeep),
    net: Math.round(state.coins - coinsBefore),
    satisfaction: Math.round(satSum / samples),
    weather,
    closedPistes: closedMax,
    bottleneck,
    coinsAfter: Math.round(state.coins),
    medal: medalThisRound,
    ...(eventTitle ? { event: eventTitle } : {}),
  };

  const round = state.match.round + 1;
  const finished = round > state.match.roundsTotal;
  let match: MatchState = {
    ...state.match,
    round: finished ? state.match.roundsTotal : round,
    ready: [],
    history: [...state.match.history, report],
    goals,
    mods: { ...NO_MODS },
    event: null,
    phase: finished ? "finished" : "plan",
  };
  if (!finished) match = { ...match, event: drawEvent({ round, startedAt: match.startedAt }, state.day) };

  state = { ...state, match, timeOfDay: 0.5 };
  const score = scoreBreakdown(state).total;
  state = { ...state, match: { ...state.match, score } };

  if (finished) {
    const result = {
      preset: state.match.preset ?? "normal",
      score,
      medals: state.match.goals.map((g) => g.medal).filter((m): m is Medal => m !== null),
      guests: state.match.history.reduce((n, r) => n + r.guests, 0),
      players: Object.values(state.contributors).map((c) => c.name),
      resortName: state.resortName,
      finishedAt: now,
    };
    state = {
      ...state,
      hallOfFame: [...state.hallOfFame, result].sort((a, b) => b.score - a.score).slice(0, MATCH.hallOfFameSize),
    };
  }
  return withPreview(state, dem);
}
