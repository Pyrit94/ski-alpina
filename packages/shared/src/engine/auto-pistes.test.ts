import assert from "node:assert/strict";
import { test } from "node:test";
import { PISTE_PLANNER } from "../../../config/src/economy.ts";
import type { Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { planAutoPistes } from "./auto-pistes.ts";
import { resortLinks } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 3_000_000;
const BUILT = NOW - 120_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });

/** A chairlift out of the village with nothing leading back down. */
function bareLift(): ResortState {
  const state: ResortState = { ...emptyResort(), timeOfDay: 0.5, xp: 999_999, coins: 900_000 };
  return applyIntent(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, BUILT).state;
}

/** Send the plans as the client does: one place_piste each, in order. */
function build(state: ResortState, hexesList: Axial[][]): ResortState {
  let s = state;
  for (const hexes of hexesList) {
    const intent = { type: "place_piste" as const, itemId: "piste" as const, hexes };
    const v = validateIntent(s, dem, intent, "builder", NOW);
    assert.ok(v.ok, v.ok ? "" : v.reason);
    s = applyIntent(s, intent, BUILT, undefined, dem).state;
  }
  return s;
}

test("a lift with no way down gets one, and it is buildable", () => {
  const state = bareLift();
  const lift = state.lifts[0]!;
  assert.equal(resortLinks(state, dem).get(lift.id), "no-descent");
  const { plans, missed } = planAutoPistes(state, dem, { mix: "mixed", budget: state.coins });
  assert.equal(missed.length, 0);
  assert.ok(plans.length >= 1);
  assert.equal(plans[0]!.why, "descent");
  assert.equal(plans[0]!.liftId, lift.id);
  const after = build(state, plans.map((p) => p.hexes));
  assert.equal(resortLinks(after, dem).get(lift.id), "ok");
  // What the plan said it costs is what it cost.
  const total = plans.reduce((n, p) => n + p.cost, 0);
  assert.equal(after.coins, state.coins - total);
});

test("a single grade is respected where the ground allows it", () => {
  const state = bareLift();
  const { plans } = planAutoPistes(state, dem, { mix: "blue", budget: state.coins });
  assert.ok(plans.length >= 1);
  assert.ok(plans.every((p) => p.why === "descent"));
});

test("nothing is planned past the budget", () => {
  const state = bareLift();
  const { plans, missed } = planAutoPistes(state, dem, { mix: "mixed", budget: 0 });
  assert.equal(plans.length, 0);
  assert.deepEqual(missed.map((m) => m.reason), ["budget"]);
});

test("only the chosen lifts are planned for", () => {
  const state = bareLift();
  const { plans } = planAutoPistes(state, dem, { liftIds: [], mix: "mixed", budget: state.coins });
  assert.equal(plans.length, 0);
});

test("runs beyond the descents are only proposed when they pay for themselves", () => {
  let state = bareLift();
  // Plenty of doors, so the runs and not the car parks are the limit.
  for (const hex of [col(-2), col(-3), { q: VILLAGE_HEX.q + 2, r: VILLAGE_HEX.r }, { q: VILLAGE_HEX.q - 2, r: VILLAGE_HEX.r }]) {
    const intent = { type: "place_building" as const, itemId: "parking" as const, q: hex.q, r: hex.r };
    if (validateIntent(state, dem, intent, "builder", NOW).ok) state = applyIntent(state, intent, BUILT).state;
  }
  const result = planAutoPistes(state, dem, { mix: "mixed", budget: state.coins });
  for (const p of result.plans.filter((x) => x.why !== "descent")) {
    assert.ok(p.gainIncome > 0);
    assert.ok(p.gainIncome * PISTE_PLANNER.paybackDays >= p.cost);
  }
  if (result.plans.length > 0) assert.ok(result.after.incomePerHour >= result.before.incomePerHour);
  // Planning again on the built result proposes nothing new that does not pay.
  const after = build(state, result.plans.map((p) => p.hexes));
  const again = planAutoPistes(after, dem, { mix: "mixed", budget: after.coins });
  assert.ok(again.plans.every((p) => p.why !== "descent"));
});
