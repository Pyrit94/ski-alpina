import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVEL, SEASON } from "../../../config/src/economy.ts";
import { CATALOG, BY_ID } from "../../../config/src/items.ts";
import { ITEM_IDS, type ItemId } from "../../../config/src/ids.ts";
import type { Axial, ResortState } from "../index.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort } from "./state.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

/** A busy resort, so capacity-limited effects have something to bite on. */
function busy(day = 10, extra: { itemId: ItemId; q: number; r: number }[] = []): ResortState {
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5, day };
  state = applyIntent(state, { type: "place_lift", itemId: "funitel", a: VILLAGE_HEX, b: col(1) }, BUILT).state;
  state = applyIntent(state, { type: "place_piste", itemId: "piste-blue", hexes: run(1, 9) }, BUILT).state;
  for (let i = 0; i < 8; i++) {
    state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 9 }, BUILT).state;
  }
  for (const e of extra) {
    state = applyIntent(state, { type: "place_building", itemId: e.itemId, q: e.q, r: e.r }, BUILT).state;
  }
  return state;
}

const revenue = (state: ResortState) => tickFlow(state, dem, 0.2, NOW).stats.revenuePerHour;
const stats = (state: ResortState) => tickFlow(state, dem, 0.2, NOW).stats;

test("every catalogue item is a known id and every id is in the catalogue", () => {
  assert.equal(CATALOG.length, ITEM_IDS.length);
  for (const id of ITEM_IDS) assert.ok(BY_ID[id], `${id} has no catalogue entry`);
});

test("the catalogue keeps unlocking past level 8", () => {
  const top = Math.max(...CATALOG.map((i) => i.unlockLevel));
  assert.ok(top > 8, `nothing unlocks above level ${top}`);
  assert.ok(top <= LEVEL.max, "an item unlocks at a level that cannot be reached");
});

test("a big canteen feeds more guests than a small restaurant", () => {
  const small = revenue(busy(10, [{ itemId: "restaurant", q: -4, r: 9 }]));
  const large = revenue(busy(10, [{ itemId: "gastro-hall", q: -4, r: 9 }]));
  assert.ok(large > small);
  assert.equal(BY_ID["gastro-hall"].seatsPerHour! > BY_ID.restaurant.seatsPerHour!, true);
});

test("a second restaurant adds seats rather than a multiplier", () => {
  const one = revenue(busy(10, [{ itemId: "restaurant", q: -4, r: 9 }]));
  const two = revenue(
    busy(10, [
      { itemId: "restaurant", q: -4, r: 9 },
      { itemId: "restaurant", q: -4, r: 8 },
    ]),
  );
  assert.ok(two > one);
});

test("the central depot cuts cableway upkeep harder than a workshop", () => {
  const bare = stats(busy());
  const shed = stats(busy(10, [{ itemId: "workshop", q: -6, r: 8 }]));
  const depot = stats(busy(10, [{ itemId: "depot", q: -6, r: 8 }]));
  // Each pays its own upkeep, so compare the discount net of that.
  const savedByShed = bare.upkeepPerHour + BY_ID.workshop.upkeep! - shed.upkeepPerHour;
  const savedByDepot = bare.upkeepPerHour + BY_ID.depot.upkeep! - depot.upkeepPerHour;
  assert.ok(savedByShed > 0);
  assert.ok(savedByDepot > savedByShed);
});

test("two workshops do not discount the bill twice", () => {
  const one = stats(busy(10, [{ itemId: "workshop", q: -6, r: 8 }]));
  const two = stats(busy(10, [
    { itemId: "workshop", q: -6, r: 8 },
    { itemId: "workshop", q: -6, r: 7 },
  ]));
  // The second one costs its upkeep and saves nothing further.
  assert.equal(two.upkeepPerHour, one.upkeepPerHour + BY_ID.workshop.upkeep!);
});

test("decoration finally does what its blurb promises", () => {
  // tree and viewpoint had no mechanical effect at all before.
  const bare = stats(busy());
  const wooded = stats(busy(10, [
    { itemId: "tree", q: -6, r: 8 },
    { itemId: "tree", q: -6, r: 7 },
    { itemId: "tree", q: -4, r: 8 },
  ]));
  assert.ok(wooded.satisfaction >= bare.satisfaction);
  assert.ok(BY_ID.viewpoint.satisfactionBonus! > 0);
});

test("a museum draws guests into a green valley", () => {
  const summerDay = SEASON.daysPerYear - 2;
  const quiet = stats(busy(summerDay));
  const drawing = stats(busy(summerDay, [{ itemId: "cablecar-museum", q: -4, r: 9 }]));
  assert.ok(drawing.demandPerHour > quiet.demandPerHour);
  // And it changes nothing in deep winter, when everyone is coming anyway.
  assert.equal(
    stats(busy(10, [{ itemId: "cablecar-museum", q: -4, r: 9 }])).demandPerHour,
    stats(busy(10)).demandPerHour,
  );
});

test("a glacier lift cannot be planted in the valley", () => {
  // It is snow-sure terrain, reached by chaining up from below.
  assert.ok(BY_ID.glacier.minElev > 2000);
  assert.ok(BY_ID.glacier.maxElev > BY_ID.gondola.maxElev);
});

test("the funitel outlifts every earlier cableway", () => {
  for (const id of ["tbar", "chair", "gondola", "tram"] as const) {
    assert.ok(BY_ID.funitel.capacity! > BY_ID[id].capacity!, `funitel not above ${id}`);
  }
  assert.ok(BY_ID.funitel.cost > BY_ID.gondola.cost);
});

test("no item costs less to build than it costs to run for a day", () => {
  // A guard against a typo making something free money forever.
  for (const item of CATALOG) {
    if (!item.upkeep) continue;
    assert.ok(item.cost > item.upkeep, `${item.id} pays for itself in under a day`);
  }
});
