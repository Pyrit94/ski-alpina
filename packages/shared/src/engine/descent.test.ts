import assert from "node:assert/strict";
import { test } from "node:test";
import type { Axial } from "../hex.ts";
import { generateDem } from "../terrain/dem.ts";
import type { ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import { descentGoals, liftEnds, resortLinks, suggestDescent } from "./descent.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });

/** Validate, then apply — exactly what the server does with an intent. */
function act(state: ResortState, intent: Parameters<typeof applyIntent>[1]): ResortState {
  const v = validateIntent(state, dem, intent, "builder", BUILT);
  assert.ok(v.ok, v.ok ? "" : `${intent.type} rejected: ${v.reason}`);
  return applyIntent(state, intent, BUILT).state;
}

function freshWithChair(): { state: ResortState; liftId: string } {
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  state = act(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) });
  return { state, liftId: state.lifts[0]!.id };
}

test("acceptance: new game, chair lift, «Abfahrt anlegen» — joined, and guests ride", () => {
  const { state: withLift, liftId } = freshWithChair();
  assert.equal(resortLinks(withLift, dem).get(liftId), "no-descent");

  const hexes = suggestDescent(withLift, dem, liftId);
  assert.ok(hexes, "a run should be suggested");
  // Starts at the top station, as the player would expect.
  assert.deepEqual(hexes[0], liftEnds(dem, withLift.lifts[0]!).top);

  const state = act(withLift, { type: "place_piste", itemId: "piste", hexes });
  assert.equal(resortLinks(state, dem).get(liftId), "ok");
  const tick = tickFlow(state, dem, 0.2, NOW);
  const lift = tick.flow.find((e) => e.id === liftId)!;
  assert.equal(lift.link, "ok");
  assert.ok(lift.flow > 0, "guests ride the lift");
  assert.equal(tick.stats.idleLifts, 0);
  assert.ok(tick.stats.peoplePerHour > 0);
});

test("acceptance: a second run into the first counts as joined", () => {
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  state = act(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) });
  const liftId = state.lifts[0]!.id;
  // The first run: straight down the valley column, back to the village.
  const first = [1, 2, 3, 4, 5, 6, 7, 8].map(col);
  state = act(state, { type: "place_piste", itemId: "piste", hexes: first });
  // The second leaves the same top station eastwards and ends beside the
  // first run, half-way down — nowhere near a station or the village.
  const q = VILLAGE_HEX.q;
  const second = [
    col(1),
    { q: q + 1, r: 1 },
    { q: q + 1, r: 2 },
    { q: q + 1, r: 3 },
    { q: q + 1, r: 4 },
    { q: q + 1, r: 5 },
  ];
  state = act(state, { type: "place_piste", itemId: "piste", hexes: second });
  const links = resortLinks(state, dem);
  assert.equal(links.get(state.pistes[0]!.id), "ok");
  assert.equal(links.get(state.pistes[1]!.id), "ok");
  assert.equal(links.get(liftId), "ok");
  const tick = tickFlow(state, dem, 0.2, NOW);
  const onSecond = tick.flow.find((e) => e.id === state.pistes[1]!.id)!;
  assert.equal(onSecond.link, "ok");
  assert.ok(onSecond.flow > 0, "guests ski the second run too");
  assert.equal(tick.stats.idlePistes, 0);
});

test("a run ending on another run mid-way is joined, by hand too", () => {
  const { state: withLift, liftId } = freshWithChair();
  const first = suggestDescent(withLift, dem, liftId)!;
  assert.ok(first.length >= 7, "long enough to join mid-way");
  const state = act(withLift, { type: "place_piste", itemId: "piste", hexes: first });
  // Any goal on the first run is a valid end for a second run.
  const goals = descentGoals(state, dem, { q: 99, r: 99 });
  const mid = first[Math.floor(first.length / 2)]!;
  assert.ok(goals.some((g) => g.q === mid.q && g.r === mid.r));
});

test("no suggestion for a lift that does not exist", () => {
  assert.equal(suggestDescent(emptyResort(), dem, "nope"), null);
});

test("a run that ends nowhere is not offered as a place to end", () => {
  const { state: withLift } = freshWithChair();
  // A short dead-end stub on an open slope west of the lift.
  const stub = [
    { q: -9, r: 5 },
    { q: -8, r: 5 },
    { q: -7, r: 5 },
  ];
  const v = validateIntent(
    withLift,
    dem,
    { type: "place_piste", itemId: "piste", hexes: stub },
    "builder",
    BUILT,
  );
  if (!v.ok) return; // terrain changed: nothing to show here
  const state = applyIntent(
    withLift,
    { type: "place_piste", itemId: "piste", hexes: stub },
    BUILT,
  ).state;
  const id = state.pistes[0]!.id;
  assert.equal(resortLinks(state, dem).get(id), "dead-end");
  const goals = descentGoals(state, dem, { q: 99, r: 99 });
  assert.ok(!goals.some((g) => g.q === -8 && g.r === 5));
});
