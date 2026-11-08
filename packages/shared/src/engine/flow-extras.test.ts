import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY } from "../../../config/src/economy.ts";
import { generateDem } from "../terrain/dem.ts";
import type { Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import { suggestDescent } from "./descent.ts";
import { openingBoost, tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort, TUTORIAL_STEPS } from "./state.ts";
import { tickResort } from "./tick.ts";
import { tutorialGoal } from "./tutorial.ts";

const dem = generateDem();
const NOW = 1_000_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const act = (s: ResortState, intent: Parameters<typeof applyIntent>[1]) => applyIntent(s, intent, NOW - 60_000).state;

function withRun(): ResortState {
  let s: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  s = act(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) });
  const hexes = suggestDescent(s, dem, s.lifts[0]!.id)!;
  return act(s, { type: "place_piste", itemId: "piste", hexes });
}

test("the tutorial follows the build: lift, then run, then guests, then it closes", () => {
  let s: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  assert.equal(s.tutorialStep, 0);
  s = act(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) });
  assert.equal(s.tutorialStep, 1, "lift built: on to the run");
  s = act(s, { type: "place_piste", itemId: "piste", hexes: suggestDescent(s, dem, s.lifts[0]!.id)! });
  assert.equal(s.tutorialStep, 2, "run built: on to the guests");
  assert.ok(s.tutorialOpen);
  s = tickResort(s, dem, 1, NOW);
  assert.equal(tutorialGoal(s), TUTORIAL_STEPS);
  assert.equal(s.tutorialOpen, false, "guests ride: done");
});

test("a dismissed tutorial stays closed", () => {
  let s: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  s = act(s, { type: "dismiss_tutorial" });
  s = act(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) });
  assert.equal(s.tutorialOpen, false);
});

test("the opening season draws extra guests, fading to nothing", () => {
  assert.equal(openingBoost({ season: 1, day: 1 }), ECONOMY.openingDemand);
  assert.ok(openingBoost({ season: 1, day: 10 }) > 1);
  assert.ok(openingBoost({ season: 1, day: 10 }) < ECONOMY.openingDemand);
  assert.equal(openingBoost({ season: 1, day: ECONOMY.openingDays + 1 }), 1);
  assert.equal(openingBoost({ season: 2, day: 1 }), 1);
  const s = withRun();
  const early = tickFlow({ ...s, day: 1 }, dem, 0.2, NOW).stats;
  const later = tickFlow({ ...s, day: ECONOMY.openingDays + 5 }, dem, 0.2, NOW).stats;
  assert.ok(early.marketPerHour > later.marketPerHour, "more people want to come at the opening");
  assert.equal(later.openingBoost, 1);
});

test("doors, restaurants and ticket offices report what they do", () => {
  let s = withRun();
  for (const [itemId, q, r] of [
    ["parking", -4, 7],
    ["restaurant", -6, 8],
    ["ticket", -3, 9],
  ] as const) {
    s = act(s, { type: "place_building", itemId, q, r });
  }
  const flow = tickFlow({ ...s, day: 30 }, dem, 0.2, NOW).flow;
  const byItem = (itemId: string) => {
    const b = s.buildings.find((x) => x.itemId === itemId)!;
    return flow.find((e) => e.id === b.id);
  };
  const parking = byItem("parking")!;
  assert.equal(parking.kind, "building");
  assert.equal(parking.unit, "arrivals");
  assert.equal(parking.capacity, ECONOMY.parkingArrivalsPerHour);
  assert.ok(parking.flow > 0 && parking.flow <= parking.capacity);
  const restaurant = byItem("restaurant")!;
  assert.equal(restaurant.unit, "served");
  assert.ok(restaurant.flow > 0);
  const ticket = byItem("ticket")!;
  assert.equal(ticket.unit, "chf");
  assert.ok(ticket.flow > 0);
});
