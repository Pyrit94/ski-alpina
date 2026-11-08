import assert from "node:assert/strict";
import { test } from "node:test";
import { applyIntent } from "../../../packages/shared/src/engine/apply.ts";
import { planAutoPistes } from "../../../packages/shared/src/engine/auto-pistes.ts";
import { VILLAGE_HEX } from "../../../packages/shared/src/engine/graph.ts";
import { emptyResort } from "../../../packages/shared/src/engine/state.ts";
import { getDem } from "../../../packages/shared/src/terrain/dem.ts";
import type { ResortState } from "../../../packages/shared/src/types.ts";
import { demFor, plannerState, runPlannerJob } from "./planner-jobs.ts";
import { requestPlan } from "./planner.ts";

const NOW = 3_000_000;

/** A chairlift out of the classic village with nothing leading back down. */
function bareLift(): ResortState {
  const state: ResortState = { ...emptyResort(), timeOfDay: 0.5, xp: 999_999, coins: 900_000 };
  return applyIntent(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: 1 } }, NOW - 120_000).state;
}

test("a planner state carries the resort, not the store's functions or UI, and survives postMessage", () => {
  const resort = bareLift();
  const store = { ...resort, sendIntent: () => undefined, sheet: "none", autoPreview: [{ hexes: [], grade: "blue" }], chat: [{ text: "hoi" }] };
  const state = plannerState(store, { ticketPrice: 77 });
  assert.equal(state.ticketPrice, 77);
  assert.equal(state.lifts, resort.lifts);
  assert.deepEqual(state.chat, []);
  assert.ok(!("sendIntent" in state));
  assert.ok(!("autoPreview" in state));
  assert.deepEqual(structuredClone(state), state);
});

test("a job works out what the planner itself does", () => {
  const state = plannerState(bareLift());
  const opts = { mix: "mixed" as const, budget: 200_000 };
  const direct = planAutoPistes(state, getDem(), opts);
  const viaJob = runPlannerJob({ kind: "auto", state: structuredClone(state), opts }, demFor(state));
  assert.deepEqual(viaJob, direct);
  assert.ok(viaJob.plans.length > 0);
});

test("without a Worker the job runs here, and a newer request supersedes an older one", async () => {
  assert.equal(typeof (globalThis as { Worker?: unknown }).Worker, "undefined");
  const state = plannerState(bareLift());
  const first = requestPlan("test", { kind: "reshapeAll", state });
  const second = requestPlan("test", { kind: "auto", state, opts: { mix: "blue", budget: 200_000 } });
  assert.equal(await first, null);
  const result = await second;
  assert.ok(result && result.plans.length > 0);
});
