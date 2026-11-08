import assert from "node:assert/strict";
import { test } from "node:test";
import { SEASON } from "../../../config/src/economy.ts";
import { LONG_GOALS, RANK, WELTCUP } from "../../../config/src/progression.ts";
import { generateDem } from "../terrain/dem.ts";
import { hexToWorld, type Axial } from "../hex.ts";
import type { PlacedLift, PlacedPiste, ProgressState, ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { absDay } from "./neighbours.ts";
import {
  advanceProgress,
  baselineProgress,
  emptyTally,
  longGoals,
  progressDemand,
  raceDay,
  rankOf,
  tierFor,
  type ProgressTick,
} from "./progression.ts";
import { emptyResort, migrateResort } from "./state.ts";
import { tickResort } from "./tick.ts";
import { cleanImport } from "../runtime/snapshot.ts";

const dem = generateDem();
const NOW = 1_000_000;
const QUIET: ProgressTick = { closed: null, closedProfit: 0, closedShare: 1, revenue: 0 };

function progress(over: Partial<ProgressState> = {}): ProgressState {
  return { rank: 0, goals: [], tally: emptyTally(1), seasons: [], best: null, weltcup: null, ...over };
}

/** A straight run of `segments` segments down one column. */
function run(difficulty: PlacedPiste["difficulty"], segments: number, score: number, q = 0): PlacedPiste {
  const hexes: Axial[] = Array.from({ length: segments + 1 }, (_, i) => ({ q, r: i }));
  return { id: `p${q}-${difficulty}`, itemId: "piste", difficulty, hexes, builtAt: 0, readyAt: 0, score };
}

function liftTo(top: Axial): PlacedLift {
  const none = { speed: 0, cabins: 0, capacity: 0 };
  return { id: "l1", itemId: "gondola", a: VILLAGE_HEX, b: top, stationA: "s1", stationB: "s2", level: 1, builtAt: 0, readyAt: 0, upgrades: none };
}

/** A hex on the map at least this high (gameplay = real metres on the generated map). */
function hexAbove(metres: number): Axial {
  for (let q = -40; q <= 40; q++) {
    for (let r = -40; r <= 40; r++) {
      const w = hexToWorld(q, r);
      if (Math.abs(w.x) > dem.world / 2 || Math.abs(w.z) > dem.world / 2) continue;
      const e = dem.sample(w.x, w.z) - dem.region.offset;
      if (e >= metres && e < metres + 800) return { q, r };
    }
  }
  throw new Error(`no hex above ${metres} m`);
}

/** About 9.6 km in three grades: a small but real resort. */
const MID_RUNS = [run("blue", 20, 40, 0), run("red", 20, 40, 1), run("black", 20, 40, 2), run("blue", 20, 40, 3)];

test("happy guests on one short run are no famous resort yet", () => {
  const tiny: ResortState = { ...emptyResort(), pistes: [run("red", 5, 52, 0)], stats: { ...emptyResort().stats, satisfaction: 90 } };
  assert.equal(rankOf(tiny).tier, 0);
  const bigger = { ...tiny, pistes: MID_RUNS };
  assert.ok(rankOf(bigger).score > rankOf(tiny).score + 15);
});

test("rank weights add up to 100 and the tiers climb from 0", () => {
  assert.equal(RANK.factors.reduce((n, f) => n + f.weight, 0), 100);
  assert.equal(RANK.tiers[0]!.min, 0);
  for (let i = 1; i < RANK.tiers.length; i++) assert.ok(RANK.tiers[i]!.min > RANK.tiers[i - 1]!.min);
  assert.equal(RANK.tiers.length, 5);
});

test("tier boundaries: a tier starts exactly at its minimum", () => {
  assert.equal(tierFor(0), 0);
  for (let i = 1; i < RANK.tiers.length; i++) {
    const min = RANK.tiers[i]!.min;
    assert.equal(tierFor(min - 0.1), i - 1, `just below ${RANK.tiers[i]!.name}`);
    assert.equal(tierFor(min), i, `at ${RANK.tiers[i]!.name}`);
  }
  assert.equal(tierFor(100), RANK.tiers.length - 1);
});

test("an empty valley is a Dorflift and a full resort is world class", () => {
  const empty = rankOf(emptyResort());
  assert.equal(empty.tier, 0);
  assert.equal(empty.name, RANK.tiers[0]!.name);
  assert.ok(empty.nextMin !== null && empty.toNext >= 0 && empty.toNext < 1);

  const full = { full: 0 } as Record<string, number>;
  for (const f of RANK.factors) full[f.id] = f.full;
  const big: ResortState = {
    ...emptyResort(),
    pistes: [run("blue", 46, full.pistePoints!, 0), run("red", 46, full.pistePoints!, 1), run("black", 46, full.pistePoints!, 2), run("park", 3, 0, 3), ...Array.from({ length: 4 }, (_, i) => run("blue", 46, full.pistePoints!, 10 + i))],
    stats: { ...emptyResort().stats, beds: full.beds!, satisfaction: full.satisfaction! },
    progress: progress({ tally: { ...emptyTally(1), guests: full.guests! } }),
  };
  const top = rankOf(big);
  assert.equal(top.score, 100);
  assert.equal(top.tier, RANK.tiers.length - 1);
  assert.equal(top.nextMin, null);
  assert.equal(top.helps.length, 0);
});

test("what helps most is the factor with the most points left", () => {
  const view = rankOf({ ...emptyResort(), stats: { ...emptyResort().stats, satisfaction: 90 } });
  const most = Math.max(...view.factors.map((f) => f.missing));
  assert.equal(view.helps[0]!.missing, most);
  // An empty valley: more km is what unlocks everything else.
  assert.equal(view.helps[0]!.id, "pisteKm");
  assert.ok(!view.helps.some((h) => h.id === "satisfaction"), "a maxed factor is no hint");
});

test("a new tier pays its reward once", () => {
  const tier1 = RANK.tiers[1]!;
  // Enough km, satisfaction, share and variety for the first step, nothing more.
  const state: ResortState = {
    ...emptyResort(),
    pistes: MID_RUNS,
    stats: { ...emptyResort().stats, satisfaction: 70 },
    progress: progress(),
  };
  assert.equal(rankOf(state).tier, 1);
  const once = advanceProgress(state, dem, QUIET, state.season, NOW);
  assert.equal(once.progress!.rank, 1);
  assert.equal(once.coins, state.coins + tier1.reward.coins);
  assert.equal(once.gems, state.gems + tier1.reward.gems);
  assert.equal(once.stars, state.stars + tier1.reward.stars);
  assert.ok(once.activity[0]!.title.includes(tier1.name));
  const twice = advanceProgress(once, dem, QUIET, once.season, NOW);
  assert.equal(twice.coins, once.coins);
  assert.equal(twice.activity.length, once.activity.length);
});

test("the season summary is recorded once, at the wrap, with the season's numbers", () => {
  const tally = {
    ...emptyTally(1),
    days: SEASON.daysPerYear - 1,
    guests: 40_000,
    revenue: 900_000,
    profit: 150_000,
    bestDay: 900,
    satisfactionSum: (SEASON.daysPerYear - 1) * 70,
    shareSum: SEASON.daysPerYear - 1,
  };
  const before: ResortState = {
    ...emptyResort(),
    day: SEASON.daysPerYear,
    timeOfDay: 0.995,
    todayIncome: 2000,
    stats: { ...emptyResort().stats, visitorsToday: 500, satisfaction: 80 },
    progress: progress({ tally }),
  };
  const after = tickResort(before, dem, 1, NOW);
  assert.equal(after.season, 2);
  assert.equal(after.day, 1);
  const seasons = after.progress!.seasons;
  assert.equal(seasons.length, 1);
  const s = seasons[0]!;
  assert.equal(s.season, 1);
  assert.equal(s.days, SEASON.daysPerYear);
  assert.equal(s.guests, 40_500);
  assert.equal(s.revenue, 900_000);
  assert.equal(s.profit, 152_000);
  assert.equal(s.bestDay, 900);
  assert.equal(s.satisfaction, Math.round(((SEASON.daysPerYear - 1) * 70 + 80) / SEASON.daysPerYear));
  assert.equal(s.share, 1);
  assert.deepEqual(s.records, [], "nothing to beat in the first season");
  // The new season starts from zero.
  assert.equal(after.progress!.tally.season, 2);
  assert.equal(after.progress!.tally.guests, 0);
  assert.ok(after.activity.some((a) => a.title === "Saisonbilanz 1"));

  // More ticks within the season do not add another.
  let later = after;
  for (let i = 0; i < 5; i++) later = tickResort(later, dem, 1, NOW + i);
  assert.equal(later.progress!.seasons.length, 1);

  // The next wrap compares with the first: more guests is a record.
  const second = tickResort(
    {
      ...later,
      day: SEASON.daysPerYear,
      timeOfDay: 0.995,
      stats: { ...later.stats, visitorsToday: 60_000, satisfaction: 50 },
      progress: { ...later.progress!, tally: { ...emptyTally(2) } },
    },
    dem,
    1,
    NOW,
  );
  const s2 = second.progress!.seasons[1]!;
  assert.equal(s2.season, 2);
  assert.ok(s2.records.includes("guests"));
  assert.ok(s2.records.includes("bestDay"));
  assert.ok(!s2.records.includes("satisfaction"));
});

test("a long-term goal completes once, with its reward", () => {
  const def = LONG_GOALS.find((g) => g.id === "hunderttausend")!;
  const state: ResortState = { ...emptyResort(), progress: progress({ tally: { ...emptyTally(1), guests: 99_999 } }) };
  const short = advanceProgress(state, dem, QUIET, 1, NOW);
  assert.ok(!short.progress!.goals.includes(def.id));
  const view = longGoals(short, dem).find((g) => g.def.id === def.id)!;
  assert.ok(view.share > 0.99 && view.share < 1);

  const met = { ...short, progress: { ...short.progress!, tally: { ...short.progress!.tally, guests: 100_000 } } };
  const done = advanceProgress(met, dem, QUIET, 1, NOW);
  assert.ok(done.progress!.goals.includes(def.id));
  assert.equal(done.coins, met.coins + def.reward.coins);
  assert.equal(done.gems, met.gems + def.reward.gems);
  assert.equal(done.stars, met.stars + def.reward.stars);
  const again = advanceProgress(done, dem, QUIET, 1, NOW);
  assert.equal(again.coins, done.coins);
  assert.equal(again.progress!.goals.filter((g) => g === def.id).length, 1);
});

test("the neighbour goal needs neighbours, and is met when none is left on its own", () => {
  const goal = (s: ResortState) => longGoals(s, dem).find((g) => g.def.id === "tarifverbund")!;
  assert.ok(goal(emptyResort()).unavailable, "without neighbours there is nothing to win");
  const nb = { id: "nb1", name: "Nachbar", base: { q: 20, r: 0 }, coins: 0, lifts: [], pistes: [], buildings: [], lastBuilt: 0, guestsYesterday: 0 };
  const open: ResortState = { ...emptyResort(), neighbours: { mode: "gemuetlich", list: [nb, { ...nb, id: "nb2", pact: true }] } };
  assert.ok(!goal(open).met);
  assert.equal(goal(open).share, 0.5);
  const allied: ResortState = { ...open, neighbours: { mode: "gemuetlich", list: [{ ...nb, pact: true }] } };
  assert.ok(goal(allied).met);
});

test("the Weltcup goal books a race day, which brings a crowd and prestige", () => {
  const top = hexAbove(2700);
  const race = run("black", Math.ceil(WELTCUP.raceKm / 0.12), 70, 5);
  const state: ResortState = {
    ...emptyResort(),
    day: 10,
    lifts: [liftTo(top)],
    pistes: [race],
    stats: { ...emptyResort().stats, beds: 1500 },
    progress: progress(),
  };
  const view = longGoals(state, dem).find((g) => g.def.id === "weltcup")!;
  assert.ok(view.met, JSON.stringify(view.needs));
  const done = advanceProgress(state, dem, QUIET, 1, NOW);
  assert.ok(done.progress!.goals.includes("weltcup"));
  assert.deepEqual(done.progress!.weltcup, { day: absDay(state) + WELTCUP.leadDays, held: false });

  // Race day: the same resort draws WELTCUP.demand times the guests.
  let circuit: ResortState = { ...emptyResort(), timeOfDay: 0.5, day: 11 };
  const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
  circuit = applyIntent(circuit, { type: "place_lift", itemId: "gondola", a: VILLAGE_HEX, b: col(1) }, NOW - 60_000).state;
  circuit = applyIntent(circuit, { type: "place_piste", itemId: "piste", hexes: Array.from({ length: 9 }, (_, i) => col(i + 1)) }, NOW - 60_000).state;
  const raceDayState = { ...circuit, progress: { ...done.progress!, weltcup: { day: absDay(circuit), held: false } } };
  assert.equal(progressDemand(raceDayState), WELTCUP.demand);
  const plain = tickFlow(circuit, dem, 0.1, NOW).stats.marketPerHour;
  const crowd = tickFlow(raceDayState, dem, 0.1, NOW).stats.marketPerHour;
  assert.ok(Math.abs(crowd / plain - WELTCUP.demand) < 0.02, `${crowd} vs ${plain}`);

  // Once the day closes the race is held: prestige and takings, and no second crowd.
  const closing = { ...raceDayState, timeOfDay: 0.995 };
  const held = tickResort(closing, dem, 1, NOW);
  assert.equal(held.progress!.weltcup!.held, true);
  assert.ok(held.stars >= closing.stars + WELTCUP.stars);
  assert.ok(held.activity.some((a) => a.title === "Weltcup ausgetragen"));
  assert.equal(progressDemand(held), 1);
});

test("a race booked for the green season moves to the next winter", () => {
  assert.equal(raceDay(10), 10);
  const summer = SEASON.daysPerYear - 2;
  assert.equal(raceDay(summer), SEASON.daysPerYear + 1);
});

test("old saves without progression load, and are set up without a burst of rewards", () => {
  // A resort big enough for the first tier, saved before progression existed.
  const old: Partial<ResortState> = {
    ...emptyResort(),
    pistes: MID_RUNS,
    stats: { ...emptyResort().stats, satisfaction: 70 },
    progress: undefined,
  };
  delete old.progress;
  const loaded = migrateResort(old);
  assert.equal(loaded.progress, undefined);
  const ticked = tickResort(loaded, dem, 0.1, NOW);
  assert.ok(ticked.progress);
  assert.equal(ticked.progress!.rank, rankOf(ticked).tier);
  assert.ok(ticked.progress!.rank >= 1);
  assert.ok(!ticked.activity.some((a) => a.title.startsWith("Gebietsrang")), "no reward for what was already reached");

  // A half-written progression is filled in.
  const partial = migrateResort({ ...emptyResort(), progress: { rank: 2 } as ProgressState });
  assert.equal(partial.progress!.rank, 2);
  assert.deepEqual(partial.progress!.seasons, []);
  assert.equal(partial.progress!.tally.season, 1);
});

test("the baseline counts goals already met as done, unpaid", () => {
  const state: ResortState = { ...emptyResort(), progress: undefined };
  const base = baselineProgress({ ...state, lifts: [liftTo(hexAbove(3100))] }, dem, 1);
  assert.ok(base.goals.includes("gletscher"));
});

test("an imported file starts its progression fresh", () => {
  const checked = cleanImport({
    lifts: [],
    buildings: [],
    pistes: [],
    progress: { rank: 4, goals: ["weltcup"], seasons: [], tally: emptyTally(1), best: null, weltcup: null },
  });
  assert.ok(checked.ok);
  if (checked.ok) assert.equal(checked.state.progress, undefined);
});

test("a match keeps its own medals: no progression while one runs", () => {
  const state: ResortState = { ...emptyResort(), progress: progress({ tally: { ...emptyTally(1), guests: 200_000 } }) };
  const inMatch = { ...state, match: { ...state.match, mode: "match" as const } };
  const out = advanceProgress(inMatch, dem, QUIET, 1, NOW);
  assert.equal(out, inMatch);
});
