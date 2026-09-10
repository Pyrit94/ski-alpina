import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import type { Axial, ResortState } from "../index.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort, entityCost, findEntity, occupiedSet } from "./state.ts";
import { validateIntent, validatePistePath } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

/** A lift out of the village with a blue run back down to it. */
function circuit(): ResortState {
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5, xp: 999_999 };
  state = applyIntent(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, BUILT).state;
  state = applyIntent(state, { type: "place_piste", itemId: "piste", hexes: run(1, 9) }, BUILT).state;
  return state;
}

test("a station id resolves to the cableway it belongs to", () => {
  const state = circuit();
  const lift = state.lifts[0]!;
  for (const id of [lift.id, lift.stationA, lift.stationB]) {
    const found = findEntity(state, id);
    assert.equal(found?.kind, "lift");
    if (found?.kind === "lift") assert.equal(found.lift.id, lift.id);
  }
});

test("demolishing a lift takes both its stations with it", () => {
  // Otherwise a station id would leave a cableway running between two
  // buildings that no longer exist.
  const state = circuit();
  const lift = state.lifts[0]!;
  assert.equal(state.buildings.length, 2);
  const after = applyIntent(state, { type: "demolish", entityId: lift.stationA }, NOW).state;
  assert.equal(after.lifts.length, 0);
  assert.equal(after.buildings.length, 0);
});

test("demolishing refunds a share of what it cost to build", () => {
  const state = circuit();
  const lift = state.lifts[0]!;
  const after = applyIntent(state, { type: "demolish", entityId: lift.id }, NOW).state;
  const expected = Math.floor(BY_ID.chair.cost * ECONOMY.demolishRefund);
  assert.equal(after.coins, state.coins + expected);
  // Under half, so rebuilding is a correction with a cost.
  assert.ok(expected < BY_ID.chair.cost / 2);
});

test("a run refunds per segment, the way it was billed", () => {
  const state = circuit();
  const piste = state.pistes[0]!;
  const segments = piste.hexes.length - 1;
  assert.equal(entityCost({ kind: "piste", piste }).coins, BY_ID["piste"].cost * segments);
  const after = applyIntent(state, { type: "demolish", entityId: piste.id }, NOW).state;
  assert.equal(
    after.coins,
    state.coins + Math.floor(BY_ID["piste"].cost * segments * ECONOMY.demolishRefund),
  );
  assert.equal(after.pistes.length, 0);
});

test("experience and stars already earned are kept", () => {
  const state = circuit();
  const after = applyIntent(state, { type: "demolish", entityId: state.lifts[0]!.id }, NOW).state;
  assert.equal(after.xp, state.xp);
  assert.equal(after.stars, state.stars);
});

test("demolishing frees the hex for building again", () => {
  const state = circuit();
  const station = state.buildings[0]!;
  const key = `${station.q},${station.r}`;
  assert.ok(occupiedSet(state).has(key));
  const after = applyIntent(state, { type: "demolish", entityId: state.lifts[0]!.id }, NOW).state;
  assert.equal(occupiedSet(after).has(key), false);
});

test("demolishing removes the upkeep it was costing", () => {
  const state = circuit();
  const before = tickFlow(state, dem, 0.2, NOW).stats.upkeepPerHour;
  const after = applyIntent(state, { type: "demolish", entityId: state.lifts[0]!.id }, NOW).state;
  assert.ok(tickFlow(after, dem, 0.2, NOW).stats.upkeepPerHour < before);
});

test("an unknown id is refused, and a visitor cannot demolish", () => {
  const state = circuit();
  const gone = validateIntent(state, dem, { type: "demolish", entityId: "nope" }, "builder", NOW);
  assert.equal(gone.ok, false);
  if (!gone.ok) assert.equal(gone.code, "invalid");
  const visitor = validateIntent(
    state,
    dem,
    { type: "demolish", entityId: state.lifts[0]!.id },
    "visitor",
    NOW,
  );
  assert.equal(visitor.ok, false);
  if (!visitor.ok) assert.equal(visitor.code, "rights");
});

test("the server checks every hex of a run, as the client's preview does", () => {
  // The server used to look only at the first hex and the descent, so a run
  // the preview painted as impossible was accepted anyway.
  const state = { ...emptyResort(), xp: 999_999 };
  // A blue run onto the Matterhorn: far too steep and far too high.
  const impossible = validateIntent(
    state,
    dem,
    { type: "place_piste", itemId: "piste", hexes: [col(1), { q: -16, r: -18 }] },
    "builder",
    NOW,
  );
  assert.equal(impossible.ok, false);
});

test("the shared rule and the intent check agree exactly", () => {
  const state = { ...emptyResort(), xp: 999_999 };
  const paths: Axial[][] = [
    run(1, 9),
    run(5, 9),
    [col(9), col(1)],
    [col(1), { q: -16, r: -18 }],
    [col(1)],
  ];
  for (const hexes of paths) {
    const direct = validatePistePath(state, dem, "piste", hexes);
    const viaIntent = validateIntent(
      state,
      dem,
      { type: "place_piste", itemId: "piste", hexes },
      "builder",
      NOW,
    );
    assert.equal(direct.ok, viaIntent.ok, `disagreed on a ${hexes.length}-hex run`);
  }
});

test("a valley run stays buildable under the stricter rule", () => {
  // Tightening the server must not make the basic first move impossible.
  const state = { ...emptyResort(), xp: 999_999 };
  assert.equal(validatePistePath(state, dem, "piste", run(1, 9)).ok, true);
});

test("a run may roll but not climb", () => {
  const state = { ...emptyResort(), xp: 999_999 };
  // Uphill from the village floor towards 1915 m is a sustained climb.
  const uphill = validatePistePath(state, dem, "piste", run(1, 9).slice().reverse());
  assert.equal(uphill.ok, false);
  if (!uphill.ok) assert.equal(uphill.code, "slope");
});

test("a road may climb, because it is not a run", () => {
  const state = { ...emptyResort(), xp: 999_999 };
  const uphill = validatePistePath(state, dem, "road", [col(11), col(9)]);
  assert.equal(uphill.ok, true);
});
