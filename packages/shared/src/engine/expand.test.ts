import assert from "node:assert/strict";
import { test } from "node:test";
import { DOOR_EXPANSION, ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexesInRange, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { PENDING_READY, startMatch, startSandbox } from "./match.ts";
import { emptyResort, entityCost, expansionCost, findEntity } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 2_000_000;
const BUILT = NOW - 120_000;

/** A resort with one car park somewhere legal near the village. */
function withBuilding(itemId: "parking" | "bus" | "restaurant"): { state: ResortState; id: string } {
  const base: ResortState = { ...emptyResort(), timeOfDay: 0.5, xp: 999_999, coins: 500_000 };
  for (const hex of hexesInRange(VILLAGE_HEX, 6) as Axial[]) {
    const intent = { type: "place_building" as const, itemId, q: hex.q, r: hex.r };
    if (!validateIntent(base, dem, intent, "builder", BUILT).ok) continue;
    const state = applyIntent(base, intent, BUILT).state;
    return { state, id: state.buildings[state.buildings.length - 1]!.id };
  }
  throw new Error(`no spot for ${itemId}`);
}

const expand = (state: ResortState, id: string) => applyIntent(state, { type: "expand_building", entityId: id }, NOW).state;
const capacityOf = (state: ResortState, id: string) => tickFlow(state, dem, 0, NOW).flow.find((e) => e.id === id)?.capacity ?? 0;

test("a car park grows deck by deck instead of being copied", () => {
  const { state, id } = withBuilding("parking");
  const before = capacityOf(state, id);
  assert.equal(before, ECONOMY.parkingArrivalsPerHour);
  const check = validateIntent(state, dem, { type: "expand_building", entityId: id }, "builder", NOW);
  assert.ok(check.ok);
  const grown = expand(state, id);
  assert.equal(grown.buildings.find((b) => b.id === id)!.level, 2);
  assert.equal(capacityOf(grown, id), ECONOMY.parkingArrivalsPerHour * 2);
  assert.equal(grown.coins, state.coins - Math.round(BY_ID.parking.cost * DOOR_EXPANSION.costShare[0]!));
  // More capacity, more to run.
  const upkeep = (s: ResortState) => tickFlow(s, dem, 0, NOW).stats.upkeepPerHour;
  assert.ok(upkeep(grown) > upkeep(state));
});

test("a bus station takes more lines, up to the top level", () => {
  const { state, id } = withBuilding("bus");
  let s = state;
  for (let l = 1; l < DOOR_EXPANSION.maxLevel; l++) s = expand(s, id);
  const b = s.buildings.find((x) => x.id === id)!;
  assert.equal(b.level, DOOR_EXPANSION.maxLevel);
  assert.equal(capacityOf(s, id), ECONOMY.busArrivalsPerHour * DOOR_EXPANSION.maxLevel);
  assert.equal(expansionCost(b), null);
  const v = validateIntent(s, dem, { type: "expand_building", entityId: id }, "builder", NOW);
  assert.equal(v.ok, false);
});

test("only car parks and bus stations can be expanded", () => {
  const { state, id } = withBuilding("restaurant");
  const v = validateIntent(state, dem, { type: "expand_building", entityId: id }, "builder", NOW);
  assert.equal(v.ok, false);
});

test("pulling down an expanded car park refunds the decks too", () => {
  const { state, id } = withBuilding("parking");
  const grown = expand(expand(state, id), id);
  const spent = entityCost(findEntity(grown, id)!).coins;
  assert.equal(
    spent,
    BY_ID.parking.cost + Math.round(BY_ID.parking.cost * DOOR_EXPANSION.costShare[0]!) + Math.round(BY_ID.parking.cost * DOOR_EXPANSION.costShare[1]!),
  );
});

test("leaving the rounds keeps the valley and finishes what was planned", () => {
  const begun = startMatch({ ...emptyResort(), xp: 999_999 }, "kurz", NOW, dem);
  let state = begun;
  for (const hex of hexesInRange(VILLAGE_HEX, 6) as Axial[]) {
    const intent = { type: "place_building" as const, itemId: "parking" as const, q: hex.q, r: hex.r };
    if (validateIntent(state, dem, intent, "builder", NOW).ok) {
      state = applyIntent(state, intent, NOW, undefined, dem).state;
      break;
    }
  }
  assert.equal(state.buildings.length, 1);
  assert.equal(state.buildings[0]!.readyAt, PENDING_READY);
  const free = applyIntent(state, { type: "free_play" }, NOW + 1, undefined, dem).state;
  assert.equal(free.match.mode, "sandbox");
  assert.equal(free.buildings.length, 1);
  assert.equal(free.buildings[0]!.readyAt, NOW + 1);
  assert.equal(free.coins, state.coins);
  // Already free: nothing to leave.
  assert.equal(validateIntent(free, dem, { type: "free_play" }, "builder", NOW).ok, false);
});

test("a new match or an empty free valley stays in its region", () => {
  const state = emptyResort("g1", "zermatt");
  assert.equal(startMatch(state, "kurz", NOW, dem).region, "zermatt");
  assert.equal(startSandbox(state).region, "zermatt");
});
