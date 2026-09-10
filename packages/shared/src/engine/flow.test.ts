import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyResort } from "./state.ts";
import { applyIntent } from "./apply.ts";
import { validateIntent } from "./validate.ts";
import { tickFlow } from "./flow.ts";
import { generateDem } from "../terrain/dem.ts";
import { tickResort } from "./tick.ts";
import { VILLAGE_HEX } from "./graph.ts";
import type { Axial, ResortState } from "../index.ts";

const dem = generateDem();

const NOW = 1_000_000;
/** Built a minute ago, so nothing is still under construction. */
const BUILT = NOW - 60_000;
/** Midday, when the hour factor is at its peak. */
const MIDDAY = 0.5;

/** The valley column through the village: r descends as the ground rises. */
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

/** A resort with a lift up from `from` and a blue run back down to it. */
function circuit(from: Axial, topR: number, bottomR: number): ResortState {
  let state: ResortState = { ...emptyResort(), timeOfDay: MIDDAY };
  state = applyIntent(state, { type: "place_lift", itemId: "chair", a: from, b: col(topR) }, BUILT).state;
  state = applyIntent(
    state,
    { type: "place_piste", itemId: "piste", hexes: run(topR, bottomR) },
    BUILT,
  ).state;
  return state;
}

test("client cannot mint coins: only applyIntent after validate", () => {
  const state = emptyResort();
  const start = state.coins;
  const intent = { type: "place_building" as const, itemId: "parking" as const, q: -4, r: 7 };
  const v = validateIntent(state, dem, intent, "builder", Date.now());
  assert.equal(v.ok, true);
  const next = applyIntent(state, intent, Date.now()).state;
  assert.equal(next.coins < start, true);
});

test("visitor has no build rights", () => {
  const state = emptyResort();
  const v = validateIntent(
    state,
    dem,
    { type: "place_building", itemId: "parking", q: -4, r: 7 },
    "visitor",
    Date.now(),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, "rights");
});

test("too expensive is rejected", () => {
  const state = { ...emptyResort(), coins: 10, xp: 50000 };
  const v = validateIntent(
    state,
    dem,
    { type: "place_building", itemId: "hotel5", q: -4, r: 7 },
    "builder",
    Date.now(),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, "budget");
});

test("a connected circuit actually carries guests, within its capacity", () => {
  const flowed = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  const lift = flowed.flow.find((e) => e.kind === "lift");
  assert.ok(lift);
  // Positive is the point: an upper bound alone would also pass at zero.
  assert.ok(lift.flow > 0, "the lift should be carrying guests");
  assert.ok(lift.flow <= lift.capacity + 1e-6);
  assert.ok(flowed.stats.peoplePerHour > 0);
  assert.ok(flowed.stats.peoplePerHour <= lift.capacity + 1);
  assert.ok(flowed.coinsDelta > 0);
});

test("a circuit built away from every arrival point earns nothing", () => {
  // The whole point of the graph: capacity that nobody can reach is worthless.
  const stranded = circuit({ q: 30, r: -20 }, -28, -20);
  const flowed = tickFlow(stranded, dem, 0.2, NOW);
  assert.equal(flowed.stats.peoplePerHour, 0);
  assert.equal(flowed.stats.revenuePerHour, 0);
  // Worse than nothing, in fact: it still costs upkeep to stand there.
  assert.ok(flowed.coinsDelta < 0);
  assert.equal(flowed.stats.idleLifts, 1);
  assert.equal(flowed.stats.idlePistes, 1);
});

test("stranded lifts add no income however many you build", () => {
  // Under the old even-split sim this was the optimal strategy.
  const connected = circuit(VILLAGE_HEX, 1, 9);
  let padded = connected;
  for (let i = 0; i < 8; i++) {
    padded = applyIntent(
      padded,
      { type: "place_lift", itemId: "gondola", a: { q: 26 + i * 3, r: -14 }, b: { q: 26 + i * 3, r: -22 } },
      BUILT,
    ).state;
  }
  const alone = tickFlow(connected, dem, 0.2, NOW);
  const padded2 = tickFlow(padded, dem, 0.2, NOW);
  // No extra throughput, no extra takings — and now a bill for the privilege.
  assert.equal(padded2.stats.peoplePerHour, alone.stats.peoplePerHour);
  assert.equal(padded2.stats.revenuePerHour, alone.stats.revenuePerHour);
  assert.ok(padded2.coinsDelta < alone.coinsDelta);
  assert.equal(padded2.stats.idleLifts, 8);
});

test("demand that cannot be routed is reported as queued, not as served", () => {
  let state = circuit(VILLAGE_HEX, 1, 9);
  // Car parks in the village pour in far more guests than one chair can lift.
  for (let i = 0; i < 12; i++) {
    state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 10 }, BUILT).state;
  }
  const flowed = tickFlow(state, dem, 0.2, NOW);
  assert.ok(flowed.stats.demandPerHour > flowed.stats.peoplePerHour);
  assert.equal(
    flowed.stats.queued,
    Math.round(flowed.stats.demandPerHour - flowed.stats.peoplePerHour),
  );
});

test("a saturated edge is named so the player knows what to widen", () => {
  let state = circuit(VILLAGE_HEX, 1, 9);
  for (let i = 0; i < 12; i++) {
    state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 10 }, BUILT).state;
  }
  const flowed = tickFlow(state, dem, 0.2, NOW);
  assert.ok(flowed.stats.bottleneckUse >= 0.92);
  assert.notEqual(flowed.stats.bottleneckLabel, "");
  assert.notEqual(flowed.stats.bottleneckId, "");
});

test("an empty resort names no bottleneck", () => {
  const flowed = tickFlow({ ...emptyResort(), timeOfDay: MIDDAY }, dem, 0.2, NOW);
  assert.equal(flowed.stats.bottleneckLabel, "");
  assert.equal(flowed.stats.peoplePerHour, 0);
});

test("food and retail revenue needs the buildings that serve it", () => {
  // The old formula was `max(1, restaurants)`, so food paid out in full with
  // nothing built and the first restaurant added exactly nothing.
  const withRestaurant = (state: ResortState) =>
    applyIntent(state, { type: "place_building", itemId: "restaurant", q: -5, r: 8 }, BUILT).state;
  const bare = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  const fed = tickFlow(withRestaurant(circuit(VILLAGE_HEX, 1, 9)), dem, 0.2, NOW);
  assert.equal(bare.stats.revenuePerHour > 0, true);
  assert.ok(fed.stats.revenuePerHour > bare.stats.revenuePerHour);
});

test("a restaurant has to earn its keep before it pays", () => {
  // At 4.20 a head it needs a real crowd to cover 260 a day, which is the
  // decision: build it too early and it is a drain.
  const withRestaurant = (state: ResortState) =>
    applyIntent(state, { type: "place_building", itemId: "restaurant", q: -5, r: 8 }, BUILT).state;
  const quiet = circuit(VILLAGE_HEX, 1, 9);
  assert.ok(
    tickFlow(withRestaurant(quiet), dem, 0.2, NOW).stats.incomePerHour <
      tickFlow(quiet, dem, 0.2, NOW).stats.incomePerHour,
    "a restaurant for 38 guests a day should not pay for itself",
  );

  let busy = quiet;
  for (let i = 0; i < 10; i++) {
    busy = applyIntent(busy, { type: "place_building", itemId: "parking", q: -6, r: 9 }, BUILT).state;
  }
  assert.ok(
    tickFlow(withRestaurant(busy), dem, 0.2, NOW).stats.incomePerHour >
      tickFlow(busy, dem, 0.2, NOW).stats.incomePerHour,
    "with a full mountain it should",
  );
});

test("upkeep is charged whether or not anyone comes", () => {
  // A stranded circuit takes no money and still costs money to run: this is
  // what makes overbuilding a mistake rather than just a slow start.
  const stranded = tickFlow(circuit({ q: 30, r: -20 }, -28, -20), dem, 0.2, NOW);
  assert.ok(stranded.stats.upkeepPerHour > 0);
  assert.equal(stranded.stats.revenuePerHour, 0);
  assert.ok(stranded.stats.incomePerHour < 0, "a dead lift should lose money");
  assert.ok(stranded.coinsDelta < 0);
});

test("each cableway is billed once, not once per station", () => {
  // place_lift also records both stations in `buildings`, so a naive sum over
  // buildings would charge every lift three times.
  const one = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  const lifts = one.stats.upkeepPerHour;
  const chair = 460;
  assert.ok(lifts < chair * 2, `upkeep ${lifts} looks like a lift billed twice`);
});

test("a workshop lowers what the cableways cost to run", () => {
  const plain = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  const maintained = tickFlow(
    applyIntent(circuit(VILLAGE_HEX, 1, 9), { type: "place_building", itemId: "workshop", q: -6, r: 9 }, BUILT).state,
    dem,
    0.2,
    NOW,
  );
  // The workshop pays its own upkeep, so compare the lift share it discounts.
  assert.ok(maintained.stats.upkeepPerHour < plain.stats.upkeepPerHour + 240);
});

test("income is revenue net of upkeep", () => {
  const flowed = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  assert.equal(
    flowed.stats.incomePerHour,
    Math.round(flowed.stats.revenuePerHour - flowed.stats.upkeepPerHour),
  );
});

test("the most profitable ticket price is not the highest one", () => {
  // The old rule only bit above 90 CHF, so 90 strictly dominated every lower
  // price and the slider was free money.
  const net = (chf: number) =>
    tickFlow({ ...circuit(VILLAGE_HEX, 1, 9), ticketPrice: chf }, dem, 0.2, NOW).stats
      .incomePerHour;
  const prices = [39, 49, 59, 69, 79, 89, 99, 119, 149];
  const best = prices.reduce((a, b) => (net(b) > net(a) ? b : a));
  assert.ok(best > 39 && best < 149, `optimum sat at the edge: ${best} CHF`);
  assert.ok(net(best) > net(149));
  assert.ok(net(best) > net(39));
});

test("a high price costs both guests and goodwill", () => {
  const cheap = tickFlow({ ...circuit(VILLAGE_HEX, 1, 9), ticketPrice: 39 }, dem, 0.2, NOW);
  const dear = tickFlow({ ...circuit(VILLAGE_HEX, 1, 9), ticketPrice: 149 }, dem, 0.2, NOW);
  assert.ok(dear.stats.demandPerHour < cheap.stats.demandPerHour);
  assert.ok(dear.stats.satisfaction < cheap.stats.satisfaction);
});

test("reputation from the last tick moves today's demand", () => {
  const base = circuit(VILLAGE_HEX, 1, 9);
  const loved = tickFlow({ ...base, stats: { ...base.stats, satisfaction: 99 } }, dem, 0.2, NOW);
  const loathed = tickFlow({ ...base, stats: { ...base.stats, satisfaction: 30 } }, dem, 0.2, NOW);
  assert.ok(loved.stats.demandPerHour > loathed.stats.demandPerHour);
});

test("vertical transported grows with the height a lift climbs", () => {
  const short = tickFlow(circuit(VILLAGE_HEX, 5, 9), dem, 0.2, NOW);
  const tall = tickFlow(circuit(VILLAGE_HEX, 1, 9), dem, 0.2, NOW);
  assert.ok(short.stats.verticalPerHour > 0);
  assert.ok(tall.stats.verticalPerHour > short.stats.verticalPerHour);
});

test("tick is deterministic for same inputs", () => {
  const a = emptyResort();
  const b = emptyResort();
  const t1 = tickResort(a, dem, 1, 50_000);
  const t2 = tickResort(b, dem, 1, 50_000);
  assert.equal(t1.coins, t2.coins);
  assert.equal(t1.timeOfDay, t2.timeOfDay);
});

test("piste must go downhill", () => {
  const state = emptyResort();
  const v = validateIntent(
    state,
    dem,
    {
      type: "place_piste",
      itemId: "piste",
      hexes: [
        { q: 0, r: 16 },
        { q: -2, r: -18 },
      ],
    },
    "builder",
    Date.now(),
  );
  assert.equal(v.ok, false);
});
