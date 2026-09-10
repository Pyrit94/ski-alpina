import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY, SEASON } from "../../../config/src/economy.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import { generateDem } from "../terrain/dem.ts";
import type { Axial, ResortState } from "../index.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import {
  naturalSnowLine,
  pisteSnowScale,
  seasonDemandShare,
  seasonPhase,
  snowLine,
} from "./season.ts";
import { emptyResort } from "./state.ts";
import { tickResort } from "./tick.ts";
import { weatherForDay } from "./weather.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

const WINTER_DAY = 10;
const SUMMER_DAY = SEASON.daysPerYear - 2;

function circuit(day: number, extra: { itemId: "snowmaker"; q: number; r: number }[] = []): ResortState {
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5, day };
  state = applyIntent(state, { type: "place_lift", itemId: "gondola", a: VILLAGE_HEX, b: col(1) }, BUILT).state;
  state = applyIntent(state, { type: "place_piste", itemId: "piste-blue", hexes: run(1, 9) }, BUILT).state;
  for (const e of extra) {
    state = applyIntent(state, { type: "place_building", itemId: e.itemId, q: e.q, r: e.r }, BUILT).state;
  }
  return state;
}

test("the year runs winter, thaw, green season", () => {
  assert.equal(seasonPhase(1), "winter");
  assert.equal(seasonPhase(WINTER_DAY), "winter");
  assert.equal(seasonPhase(Math.round(SEASON.daysPerYear * 0.7)), "spring");
  assert.equal(seasonPhase(SUMMER_DAY), "summer");
  // Day one of the next year is winter again.
  assert.equal(seasonPhase(SEASON.daysPerYear + 1), "winter");
});

test("the snow line is flat in winter, climbs in the thaw, tops out in summer", () => {
  assert.equal(naturalSnowLine(1), SEASON.winterSnowLine);
  assert.equal(naturalSnowLine(WINTER_DAY), SEASON.winterSnowLine);
  const thaw = naturalSnowLine(Math.round(SEASON.daysPerYear * 0.7));
  assert.ok(thaw > SEASON.winterSnowLine && thaw < SEASON.summerSnowLine);
  assert.equal(naturalSnowLine(SUMMER_DAY), SEASON.summerSnowLine);
});

test("poor snow lifts the line and cannons push it back down", () => {
  const fine = snowLine(WINTER_DAY, 1, 0);
  const poor = snowLine(WINTER_DAY, 0.2, 0);
  assert.ok(poor > fine);
  assert.ok(snowLine(WINTER_DAY, 0.2, 4) < poor);
  // Snowmaking buys a low resort weeks, not a whole summer.
  const capped = snowLine(WINTER_DAY, 0.2, 99);
  assert.equal(capped, snowLine(WINTER_DAY, 0.2, Math.ceil(SEASON.maxSnowmakerDrop / SEASON.snowmakerDrop)));
});

test("a run above the line is untouched and one far below it closes", () => {
  assert.equal(pisteSnowScale(2400, 2000), 1);
  assert.equal(pisteSnowScale(2000, 2000), 1);
  assert.equal(pisteSnowScale(2000 - SEASON.fadeMetres, 2000), 0);
  const partly = pisteSnowScale(2000 - SEASON.fadeMetres / 2, 2000);
  assert.ok(partly > 0 && partly < 1);
});

test("a valley run closes in the green season while the cableway still earns", () => {
  const winter = tickFlow(circuit(WINTER_DAY), dem, 0.2, NOW);
  const summer = tickFlow(circuit(SUMMER_DAY), dem, 0.2, NOW);
  assert.equal(winter.stats.closedPistes, 0);
  assert.equal(summer.stats.closedPistes, 1);
  // A gondola carries sightseers both ways, so summer is quieter, not dead.
  assert.ok(summer.stats.peoplePerHour > 0, "sightseeing should still run");
  assert.ok(summer.stats.peoplePerHour < winter.stats.peoplePerHour);
  assert.ok(summer.stats.snowLineM > winter.stats.snowLineM);
});

test("fewer guests come once the mountain is green", () => {
  assert.equal(seasonDemandShare(WINTER_DAY), 1);
  assert.equal(seasonDemandShare(SUMMER_DAY), SEASON.summerDemandShare);
  assert.ok(
    tickFlow(circuit(SUMMER_DAY), dem, 0.2, NOW).stats.demandPerHour <
      tickFlow(circuit(WINTER_DAY), dem, 0.2, NOW).stats.demandPerHour,
  );
});

test("snowmaking keeps a low run open through the thaw", () => {
  const thawDay = Math.round(SEASON.daysPerYear * 0.68);
  const bare = tickFlow(circuit(thawDay), dem, 0.2, NOW);
  const made = tickFlow(
    circuit(thawDay, [
      { itemId: "snowmaker", q: -5, r: 2 },
      { itemId: "snowmaker", q: -5, r: 3 },
      { itemId: "snowmaker", q: -5, r: 4 },
    ]),
    dem,
    0.2,
    NOW,
  );
  assert.ok(made.stats.snowLineM < bare.stats.snowLineM);
  assert.ok(made.stats.closedPistes <= bare.stats.closedPistes);
});

test("weather is the same every time for a given day", () => {
  // The sim is authoritative and shared: two clients on one day must agree,
  // and reloading a room must not reroll the sky.
  const a = weatherForDay(3, 17);
  const b = weatherForDay(3, 17);
  assert.deepEqual(a, b);
  assert.notDeepEqual(weatherForDay(3, 18), a);
  assert.notDeepEqual(weatherForDay(4, 17), a);
});

test("every winter sky is reachable, storms included", () => {
  // The old client-side roll tested `> 0.97` after `> 0.82`, so a storm could
  // never happen at all.
  const kinds = new Set<string>();
  for (let day = 1; day <= Math.floor(SEASON.daysPerYear * SEASON.winterShare); day++) {
    for (let season = 1; season <= 12; season++) kinds.add(weatherForDay(season, day).kind);
  }
  for (const kind of ["sun", "cloud", "snow", "fog", "storm"]) {
    assert.ok(kinds.has(kind), `${kind} never occurs`);
  }
});

test("the green season is warm and has no powder", () => {
  for (let season = 1; season <= 6; season++) {
    const w = weatherForDay(season, SUMMER_DAY);
    assert.ok(w.tempC > 0, `summer temp ${w.tempC}`);
    assert.ok(w.snowQuality < 0.5);
  }
});

test("rolling into a new day rolls the sky with it", () => {
  // The wiring, not just the generator: weather used to be client-side only
  // and could never reach the sim that decides the snow line.
  const before: ResortState = { ...emptyResort(), timeOfDay: 0.98, day: 5 };
  // A step long enough to cross midnight.
  const after = tickResort(before, dem, ECONOMY.daySecondsReal * 0.05, NOW);
  assert.equal(after.day, 6);
  assert.deepEqual(after.weather, weatherForDay(after.season, 6));
  assert.notDeepEqual(after.weather, before.weather);
});

test("the year wraps into the next season, taking the calendar from config", () => {
  const eve: ResortState = { ...emptyResort(), timeOfDay: 0.98, day: SEASON.daysPerYear };
  const after = tickResort(eve, dem, ECONOMY.daySecondsReal * 0.05, NOW);
  assert.equal(after.day, 1);
  assert.equal(after.season, eve.season + 1);
});

test("within one day the sky is left alone", () => {
  const noon: ResortState = { ...emptyResort(), timeOfDay: 0.5, day: 5 };
  const after = tickResort(noon, dem, 1, NOW);
  assert.equal(after.day, 5);
  assert.deepEqual(after.weather, noon.weather);
});

test("a standing contract comes back harder instead of ending", () => {
  const def = QUEST_DEFS.find((d) => d.repeatable)!;
  let state = emptyResort();
  const before = state.quests.find((q) => q.id === def.id)!;
  state = { ...state, quests: state.quests.map((q) => (q.id === def.id ? { ...q, progress: q.target } : q)) };
  const after = applyIntent(state, { type: "claim_quest", questId: def.id }, NOW).state;
  const renewed = after.quests.find((q) => q.id === def.id)!;
  assert.equal(renewed.claimed, false, "a contract should not be closed out");
  assert.equal(renewed.tier, 1);
  assert.equal(renewed.progress, 0);
  assert.ok(renewed.target > before.target);
  assert.ok(renewed.coins > before.coins);
  // The reward paid out is the one that was standing, not the raised one.
  assert.equal(after.coins, state.coins + before.coins);
});

test("a one-shot goal still closes out for good", () => {
  const def = QUEST_DEFS.find((d) => !d.repeatable)!;
  let state = emptyResort();
  state = { ...state, quests: state.quests.map((q) => (q.id === def.id ? { ...q, progress: q.target } : q)) };
  const after = applyIntent(state, { type: "claim_quest", questId: def.id }, NOW).state;
  const done = after.quests.find((q) => q.id === def.id)!;
  assert.equal(done.claimed, true);
  assert.equal(done.tier, 0);
});

test("a contract's target follows its tier, so retuning config reaches a save", () => {
  const def = QUEST_DEFS.find((d) => d.repeatable)!;
  let state = emptyResort();
  for (let i = 0; i < 3; i++) {
    state = { ...state, quests: state.quests.map((q) => (q.id === def.id ? { ...q, progress: q.target } : q)) };
    state = applyIntent(state, { type: "claim_quest", questId: def.id }, NOW).state;
  }
  const q = state.quests.find((x) => x.id === def.id)!;
  assert.equal(q.tier, 3);
  assert.equal(q.target, Math.round(def.target * Math.pow(def.growth ?? 1.6, 3)));
});
