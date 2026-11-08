import { FLOW, NEIGHBOURS, ECONOMY, SEASON } from "../../../config/src/economy.ts";
import {
  LONG_GOALS,
  RANK,
  SEASON_REPORT,
  WELTCUP,
  type LongGoalDef,
  type LongGoalNeed,
  type ProgressReward,
  type RankFactorDef,
  type RankFactorId,
} from "../../../config/src/progression.ts";
import { hexToWorld, type Axial } from "../hex.ts";
import { createId } from "../ids.ts";
import type { Dem } from "../terrain/dem.ts";
import type {
  ActivityEntry,
  DailyRecord,
  PlacedPiste,
  ProgressState,
  ResortState,
  SeasonRecordKey,
  SeasonSummary,
  SeasonTally,
} from "../types.ts";
import { absDay } from "./neighbours.ts";
import { pistePoints } from "./piste-score.ts";
import { seasonPhase } from "./season.ts";

/**
 * Free-play progression across seasons.
 *
 * - **Gebietsrang**: a score out of 100 from config-weighted figures (RANK),
 *   read into five tiers. Each tier pays its reward once, the first time.
 * - **Saisonbilanz**: the clock adds up every finished day; when the year
 *   wraps, the season becomes a summary in `progress.seasons`.
 * - **Fernziele**: long-term goals (LONG_GOALS), checked every tick and paid
 *   once. The Weltcup goal also books a race day with a guest surge.
 *
 * Everything is worked out from the state, without chance. Matches keep their
 * own medals: none of this runs while one is on.
 */

const ACTIVITY_LIMIT = 30;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function emptyTally(season: number): SeasonTally {
  return { season, days: 0, guests: 0, revenue: 0, profit: 0, bestDay: 0, satisfactionSum: 0, shareSum: 0 };
}

// ---------------------------------------------------------------------------
// Figures read off the resort

const runKm = (p: Pick<PlacedPiste, "hexes">) => Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment;

/** Km of run built, parks at their equivalent; roads do not count. */
export function builtPisteKm(state: Pick<ResortState, "pistes">): number {
  let km = 0;
  for (const p of state.pistes) {
    if (p.difficulty === "road") continue;
    km += p.difficulty === "park" ? ECONOMY.parkKmEquivalent : runKm(p);
  }
  return Math.round(km * 10) / 10;
}

/** Points of the runs, weighted by length. 0 without any. */
export function meanPistePoints(state: Pick<ResortState, "pistes">): number {
  let sum = 0;
  let km = 0;
  for (const p of state.pistes) {
    if (p.difficulty === "road" || p.difficulty === "park") continue;
    const k = runKm(p);
    sum += pistePoints(p) * k;
    km += k;
  }
  return km > 0 ? sum / km : 0;
}

/** Grades on offer: blue, red, black, park. */
export function gradeVariety(state: Pick<ResortState, "pistes">): number {
  return new Set(state.pistes.filter((p) => p.difficulty !== "road").map((p) => p.difficulty)).size;
}

/** Share of the region's guests that stays with the players, 0 … 1. */
export function marketShare(state: Pick<ResortState, "stats">): number {
  return clamp01(1 - (state.stats.neighbourCut ?? 0));
}

/** Mean satisfaction over the last finished days, or the current figure before the first. */
export function settledSatisfaction(state: Pick<ResortState, "daily" | "stats">): number {
  const days = (state.daily ?? []).slice(-RANK.satisfactionDays);
  if (days.length === 0) return state.stats.satisfaction;
  return days.reduce((n, d) => n + d.satisfaction, 0) / days.length;
}

/** Guests in the running season, or in the last finished one if that was more. */
export function seasonGuests(state: Pick<ResortState, "progress">): number {
  const p = state.progress;
  if (!p) return 0;
  const last = p.seasons[p.seasons.length - 1];
  return Math.max(p.tally.guests, last?.guests ?? 0);
}

// ---------------------------------------------------------------------------
// Gebietsrang

export interface RankFactorView {
  id: RankFactorId;
  label: string;
  hint: string;
  value: number;
  /** 0 … 1 of the factor's weight earned. */
  share: number;
  points: number;
  /** Points still to win on this factor. */
  missing: number;
}

export interface RankView {
  /** 0 … 100. */
  score: number;
  /** Index into RANK.tiers. */
  tier: number;
  name: string;
  /** Score the next tier starts at, or null at the top. */
  nextMin: number | null;
  nextName: string | null;
  /** 0 … 1 of the way from this tier to the next (1 at the top). */
  toNext: number;
  factors: RankFactorView[];
  /** 0 … 1: how far the gated factors count yet (see RANK.gateKm). */
  gate: number;
  /** The factors with the most points left, best first (RANK.hints). */
  helps: RankFactorView[];
}

type RankInput = Pick<ResortState, "pistes" | "stats" | "daily" | "progress">;

function factorValue(state: RankInput, id: RankFactorId): number {
  switch (id) {
    case "guests":
      return seasonGuests(state);
    case "satisfaction":
      return settledSatisfaction(state);
    case "pisteKm":
      return builtPisteKm(state);
    case "pistePoints":
      return meanPistePoints(state);
    case "variety":
      return gradeVariety(state);
    case "beds":
      return state.stats.beds;
    case "share":
      return marketShare(state);
  }
}

function factorShare(def: RankFactorDef, value: number): number {
  return def.full > def.from ? clamp01((value - def.from) / (def.full - def.from)) : 0;
}

/** Index of the tier a score falls in. */
export function tierFor(score: number): number {
  let tier = 0;
  RANK.tiers.forEach((t, i) => {
    if (score >= t.min) tier = i;
  });
  return tier;
}

/** The resort's rank as it stands. */
export function rankOf(state: RankInput): RankView {
  // Happy guests on one short run are not fame yet: the quality factors
  // count in proportion to the size of the area (RANK.gateKm).
  const gate = clamp01(builtPisteKm(state) / RANK.gateKm);
  let gatedLoss = 0;
  const factors = RANK.factors.map((def): RankFactorView => {
    const value = factorValue(state, def.id);
    const share = factorShare(def, value);
    const g = def.gated ? gate : 1;
    const points = def.weight * share * g;
    gatedLoss += def.weight * share * (1 - g);
    // What improving this factor itself would win.
    return { id: def.id, label: def.label, hint: def.hint, value, share, points, missing: def.weight * g * (1 - share) };
  });
  // Points the gate holds back are won by more km of run.
  for (const f of factors) if (f.id === "pisteKm") f.missing += gatedLoss;
  const raw = factors.reduce((n, f) => n + f.points, 0);
  const score = Math.round(raw * 10) / 10;
  const tier = tierFor(score);
  const cur = RANK.tiers[tier]!;
  const next = RANK.tiers[tier + 1] ?? null;
  const toNext = next ? clamp01((score - cur.min) / (next.min - cur.min)) : 1;
  const helps = factors
    .filter((f) => f.missing > 0.05)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, RANK.hints);
  return { score, tier, name: cur.name, nextMin: next?.min ?? null, nextName: next?.name ?? null, toNext, factors, gate, helps };
}

// ---------------------------------------------------------------------------
// Fernziele

export interface NeedView extends LongGoalNeed {
  value: number;
  /** 0 … 1 of the way there. */
  share: number;
  met: boolean;
}

export interface LongGoalView {
  def: LongGoalDef;
  needs: NeedView[];
  /** Mean of the needs' shares. */
  share: number;
  /** Rewarded already. */
  done: boolean;
  /** Every need met right now. */
  met: boolean;
  /** The goal cannot be reached in this game (e.g. no neighbours). */
  unavailable: boolean;
}

const elevReal = (dem: Dem, h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z) - dem.region.offset;
};

/** Highest lift station of the resort, real metres. 0 without lifts. */
export function topStationMetres(state: Pick<ResortState, "lifts">, dem: Dem): number {
  let top = 0;
  for (const l of state.lifts) {
    for (const h of l.mid ? [l.a, l.b, l.mid] : [l.a, l.b]) top = Math.max(top, elevReal(dem, h));
  }
  return Math.round(top);
}

function neighboursOpen(state: Pick<ResortState, "neighbours">): { open: number; total: number } | null {
  const n = state.neighbours;
  if (!n || n.mode === "off") return null;
  const open = n.list.filter((x) => !x.pact).length;
  return { open, total: Math.max(NEIGHBOURS.count, n.list.length) };
}

type GoalInput = Pick<ResortState, "pistes" | "lifts" | "stats" | "neighbours" | "progress">;

function needValue(state: GoalInput, dem: Dem, need: LongGoalNeed): { value: number; share: number; met: boolean } | null {
  const up = (value: number) => ({ value, share: clamp01(need.target > 0 ? value / need.target : 1), met: value >= need.target });
  switch (need.metric) {
    case "blackRunKm": {
      const km = state.pistes.filter((p) => p.difficulty === "black").reduce((m, p) => Math.max(m, runKm(p)), 0);
      return up(Math.round(km * 100) / 100);
    }
    case "raceRunPoints": {
      const pts = state.pistes
        .filter((p) => p.difficulty === "black" && runKm(p) >= WELTCUP.raceKm - 1e-9)
        .reduce((m, p) => Math.max(m, pistePoints(p)), 0);
      return up(pts);
    }
    case "topStationM":
      return up(topStationMetres(state, dem));
    case "beds":
      return up(state.stats.beds);
    case "seasonGuests": {
      const p = state.progress;
      const best = Math.max(p?.tally.guests ?? 0, p?.best?.guests ?? 0);
      return up(Math.round(best));
    }
    case "neighboursOpen": {
      const n = neighboursOpen(state);
      if (!n) return null;
      return { value: n.open, share: clamp01((n.total - n.open) / Math.max(1, n.total)), met: n.open <= need.target };
    }
  }
}

/** Every long-term goal with its progress. */
export function longGoals(state: GoalInput, dem: Dem): LongGoalView[] {
  const done = new Set(state.progress?.goals ?? []);
  return LONG_GOALS.map((def) => {
    let unavailable = false;
    const needs = def.needs.map((need): NeedView => {
      const v = needValue(state, dem, need);
      if (!v) {
        unavailable = true;
        return { ...need, value: 0, share: 0, met: false };
      }
      return { ...need, ...v };
    });
    const share = needs.length ? needs.reduce((n, x) => n + x.share, 0) / needs.length : 0;
    return {
      def,
      needs,
      share: done.has(def.id) ? 1 : share,
      done: done.has(def.id),
      met: !unavailable && needs.every((x) => x.met),
      unavailable,
    };
  });
}

// ---------------------------------------------------------------------------
// The Weltcup race day

/** Season and day of an absolute day (the inverse of `absDay`). */
export function fromAbsDay(day: number): { season: number; day: number } {
  const season = Math.floor((day - 1) / SEASON.daysPerYear) + 1;
  return { season, day: day - (season - 1) * SEASON.daysPerYear };
}

/** A race needs snow: a day outside winter moves to the first day of the next one. */
export function raceDay(day: number): number {
  const at = fromAbsDay(day);
  return seasonPhase(at.day) === "winter" ? day : at.season * SEASON.daysPerYear + 1;
}

/** Whether today is the booked Weltcup race day. */
export function weltcupToday(state: Pick<ResortState, "progress" | "season" | "day">): boolean {
  const w = state.progress?.weltcup;
  return !!w && !w.held && w.day === absDay(state);
}

/** Demand multiplier events put on free play: the Weltcup crowd. */
export function progressDemand(state: Pick<ResortState, "progress" | "season" | "day" | "match">): number {
  if (state.match?.mode === "match") return 1;
  return weltcupToday(state) ? WELTCUP.demand : 1;
}

// ---------------------------------------------------------------------------
// The clock

/** What a tick hands over: the day it closed (if any) and what it took in. */
export interface ProgressTick {
  /** The day that just ended, as recorded for the charts. */
  closed: DailyRecord | null;
  /** Net takings of that day after «Tarifverbund» fees. */
  closedProfit: number;
  /** Market share at the close of that day, 0 … 1. */
  closedShare: number;
  /** Gross takings this tick. */
  revenue: number;
}

function grant(state: ResortState, reward: ProgressReward): ResortState {
  return {
    ...state,
    coins: state.coins + reward.coins,
    gems: state.gems + reward.gems,
    stars: state.stars + reward.stars,
  };
}

export function rewardText(r: ProgressReward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins.toLocaleString("de-CH")} CHF`);
  if (r.gems) parts.push(`${r.gems} Edelsteine`);
  if (r.stars) parts.push(`${r.stars} ${r.stars === 1 ? "Stern" : "Sterne"}`);
  return parts.join(", ");
}

function log(state: ResortState, entries: Omit<ActivityEntry, "id" | "at" | "actor" | "actorName">[], now: number): ResortState {
  if (entries.length === 0) return state;
  const made = entries.map((e) => ({ ...e, id: createId("a"), at: now, actor: "", actorName: "Gebiet" }));
  return { ...state, activity: [...made.reverse(), ...(state.activity ?? [])].slice(0, ACTIVITY_LIMIT) };
}

/**
 * A fresh progression for a resort that has none (new, old save or import).
 * What is already reached counts as reached, without paying for it, so an
 * imported resort cannot be farmed for rewards and an old save is not
 * greeted by a burst of medals.
 */
export function baselineProgress(state: ResortState, dem: Dem, season: number): ProgressState {
  const seed: ProgressState = {
    rank: 0,
    goals: [],
    tally: emptyTally(season),
    seasons: [],
    best: null,
    weltcup: null,
  };
  const probe = { ...state, progress: seed };
  const rank = rankOf(probe).tier;
  const goals = longGoals(probe, dem)
    .filter((g) => g.met)
    .map((g) => g.def.id);
  return { ...seed, rank, goals };
}

/** Bring a saved progression up to shape; null for something unusable. */
export function migrateProgress(p: Partial<ProgressState> | undefined, season: number): ProgressState | undefined {
  if (!p || typeof p !== "object") return undefined;
  return {
    rank: Math.max(0, Math.min(RANK.tiers.length - 1, p.rank ?? 0)),
    goals: (p.goals ?? []).filter((id) => LONG_GOALS.some((g) => g.id === id)),
    tally: { ...emptyTally(season), ...(p.tally ?? {}) },
    seasons: (p.seasons ?? []).slice(-SEASON_REPORT.historySeasons),
    best: p.best ?? null,
    weltcup: p.weltcup ?? null,
  };
}

const RECORD_KEYS: SeasonRecordKey[] = ["guests", "revenue", "profit", "bestDay", "satisfaction"];

/** The finished season, from its tally. */
export function summarizeSeason(tally: SeasonTally, rank: number, best: ProgressState["best"]): SeasonSummary {
  const days = Math.max(1, tally.days);
  const summary: SeasonSummary = {
    season: tally.season,
    days: tally.days,
    guests: Math.round(tally.guests),
    revenue: Math.round(tally.revenue),
    profit: Math.round(tally.profit),
    bestDay: Math.round(tally.bestDay),
    satisfaction: Math.round(tally.satisfactionSum / days),
    share: Math.round((tally.shareSum / days) * 1000) / 1000,
    rank,
    records: [],
  };
  if (best) summary.records = RECORD_KEYS.filter((k) => summary[k] > best[k]);
  return summary;
}

function bestOf(best: ProgressState["best"], s: SeasonSummary): NonNullable<ProgressState["best"]> {
  const out = {} as Record<SeasonRecordKey, number>;
  for (const k of RECORD_KEYS) out[k] = Math.max(best?.[k] ?? -Infinity, s[k]);
  return out;
}

const RECORD_LABEL: Record<SeasonRecordKey, string> = {
  guests: "Gäste",
  revenue: "Umsatz",
  profit: "Gewinn",
  bestDay: "Bester Tag",
  satisfaction: "Zufriedenheit",
};

export function recordLabel(k: SeasonRecordKey): string {
  return RECORD_LABEL[k];
}

/**
 * One tick of progression, after the sim has run. `prevSeason` is the season
 * before the tick: when it differs from `state.season`, the year wrapped.
 */
export function advanceProgress(
  state: ResortState,
  dem: Dem,
  tick: ProgressTick,
  prevSeason: number,
  now: number,
): ResortState {
  if (state.match?.mode === "match") return state;
  let next = state;
  let p: ProgressState = state.progress ?? baselineProgress(state, dem, prevSeason);
  const notes: Omit<ActivityEntry, "id" | "at" | "actor" | "actorName">[] = [];

  // A day ended: add it to the season.
  if (tick.closed) {
    const d = tick.closed;
    const t = p.tally.season === d.season ? p.tally : emptyTally(d.season);
    p = {
      ...p,
      tally: {
        ...t,
        days: t.days + 1,
        guests: t.guests + d.guests,
        profit: t.profit + tick.closedProfit,
        bestDay: Math.max(t.bestDay, d.guests),
        satisfactionSum: t.satisfactionSum + d.satisfaction,
        shareSum: t.shareSum + tick.closedShare,
      },
    };
    // The Weltcup ran today: prestige, and the takings from it.
    const w = p.weltcup;
    if (w && !w.held && w.day === absDay(d)) {
      p = { ...p, weltcup: { ...w, held: true } };
      next = grant(next, { coins: WELTCUP.coins, gems: 0, stars: WELTCUP.stars });
      notes.push({
        title: "Weltcup ausgetragen",
        body: `${d.guests.toLocaleString("de-CH")} Gäste am Renntag. +${WELTCUP.stars} Sterne, ${WELTCUP.coins.toLocaleString("de-CH")} CHF aus TV-Rechten und Sponsoring.`,
        kind: "ok",
      });
    }
  }

  // The year wrapped: the season becomes a summary.
  if (state.season !== prevSeason) {
    const rank = rankOf({ ...next, progress: p }).tier;
    const summary = summarizeSeason(p.tally, rank, p.best);
    p = {
      ...p,
      seasons: [...p.seasons, summary].slice(-SEASON_REPORT.historySeasons),
      best: bestOf(p.best, summary),
      tally: emptyTally(state.season),
    };
    notes.push({
      title: `Saisonbilanz ${summary.season}`,
      body: `${summary.guests.toLocaleString("de-CH")} Gäste, Gewinn ${summary.profit.toLocaleString("de-CH")} CHF${summary.records.length ? `. Rekord: ${summary.records.map(recordLabel).join(", ")}` : ""}.`,
      kind: "info",
    });
  } else if (p.tally.season !== state.season) {
    p = { ...p, tally: emptyTally(state.season) };
  }

  if (tick.revenue > 0) p = { ...p, tally: { ...p.tally, revenue: p.tally.revenue + tick.revenue } };

  // A new rank: each tier pays once.
  const tier = rankOf({ ...next, progress: p }).tier;
  if (tier > p.rank) {
    for (let i = p.rank + 1; i <= tier; i++) {
      const def = RANK.tiers[i]!;
      next = grant(next, def.reward);
      const reward = rewardText(def.reward);
      notes.push({
        title: `Gebietsrang: ${def.name}`,
        body: `${"★".repeat(i + 1)} Euer Gebiet ist jetzt ein ${def.name}.${reward ? ` Belohnung: ${reward}.` : ""}`,
        kind: "ok",
      });
    }
    p = { ...p, rank: tier };
  }

  // Long-term goals: met now, paid once.
  const fresh = longGoals({ ...next, progress: p }, dem).filter((g) => !g.done && g.met);
  for (const g of fresh) {
    next = grant(next, g.def.reward);
    p = { ...p, goals: [...p.goals, g.def.id] };
    let body = `Belohnung: ${rewardText(g.def.reward)}.`;
    if (g.def.event === "weltcup" && !p.weltcup) {
      const day = raceDay(absDay(state) + WELTCUP.leadDays);
      p = { ...p, weltcup: { day, held: false } };
      const at = fromAbsDay(day);
      body += ` Das Rennen findet in Saison ${at.season}, Tag ${at.day} statt: ×${WELTCUP.demand} Gäste.`;
    }
    notes.push({ title: `Fernziel erreicht: ${g.def.title}`, body, kind: "ok" });
  }

  return log({ ...next, progress: p }, notes, now);
}
