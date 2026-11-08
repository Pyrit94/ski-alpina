import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILDING_LEVELS, ECONOMY, PISTE_LEVELS } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { RESEARCH_GATE } from "../../../config/src/research.ts";
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
function withBuilding(itemId: "parking" | "bus" | "restaurant" | "hotel1"): { state: ResortState; id: string } {
  const base: ResortState = {
    ...emptyResort(),
    timeOfDay: 0.5,
    xp: 999_999,
    coins: 500_000,
    // Everything researched: these tests are about expanding, not unlocking.
    research: { ...emptyResort().research, done: [...new Set(Object.values(RESEARCH_GATE))] as string[] },
  };
  for (const hex of hexesInRange(VILLAGE_HEX, 6) as Axial[]) {
    const intent = { type: "place_building" as const, itemId, q: hex.q, r: hex.r };
    if (!validateIntent(base, dem, intent, "builder", BUILT).ok) continue;
    const state = applyIntent(base, intent, BUILT).state;
    return { state, id: state.buildings[state.buildings.length - 1]!.id };
  }
  throw new Error(`no spot for ${itemId}`);
}

const expand = (state: ResortState, id: string) => applyIntent(state, { type: "expand", entityId: id }, NOW).state;
const capacityOf = (state: ResortState, id: string) => tickFlow(state, dem, 0, NOW).flow.find((e) => e.id === id)?.capacity ?? 0;

test("a car park grows deck by deck instead of being copied", () => {
  const { state, id } = withBuilding("parking");
  const before = capacityOf(state, id);
  assert.equal(before, ECONOMY.parkingArrivalsPerHour);
  const check = validateIntent(state, dem, { type: "expand", entityId: id }, "builder", NOW);
  assert.ok(check.ok);
  const grown = expand(state, id);
  assert.equal(grown.buildings.find((b) => b.id === id)!.level, 2);
  assert.equal(capacityOf(grown, id), ECONOMY.parkingArrivalsPerHour * 2);
  assert.equal(grown.coins, state.coins - Math.round(BY_ID.parking.cost * BUILDING_LEVELS.costShare[0]!));
  // More capacity, more to run.
  const upkeep = (s: ResortState) => tickFlow(s, dem, 0, NOW).stats.upkeepPerHour;
  assert.ok(upkeep(grown) > upkeep(state));
});

test("a bus station takes more lines, up to the top level", () => {
  const { state, id } = withBuilding("bus");
  let s = state;
  for (let l = 1; l < BUILDING_LEVELS.maxLevel; l++) s = expand(s, id);
  const b = s.buildings.find((x) => x.id === id)!;
  assert.equal(b.level, BUILDING_LEVELS.maxLevel);
  assert.equal(capacityOf(s, id), ECONOMY.busArrivalsPerHour * BUILDING_LEVELS.maxLevel);
  assert.equal(expansionCost(b), null);
  const v = validateIntent(s, dem, { type: "expand", entityId: id }, "builder", NOW);
  assert.equal(v.ok, false);
});

test("lifts, roads and plain decoration do not expand", () => {
  const { state } = withBuilding("restaurant");
  const tree = applyIntent({ ...state }, { type: "place_building", itemId: "tree", q: VILLAGE_HEX.q + 1, r: VILLAGE_HEX.r + 3 }, BUILT).state;
  const t = tree.buildings.find((b) => b.itemId === "tree");
  if (t) assert.equal(validateIntent(tree, dem, { type: "expand", entityId: t.id }, "builder", NOW).ok, false);
  const lifted = applyIntent(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: VILLAGE_HEX.r + 1 } }, BUILT).state;
  assert.equal(validateIntent(lifted, dem, { type: "expand", entityId: lifted.lifts[0]!.id }, "builder", NOW).ok, false);
});

test("a restaurant seats more and a hotel gets more beds per level", () => {
  const r = withBuilding("restaurant");
  const grown = expand(r.state, r.id);
  // The location factor (SITE) scales both levels alike.
  assert.ok(Math.abs(capacityOf(grown, r.id) - capacityOf(r.state, r.id) * 2) < 1e-6);
  const h = withBuilding("hotel1");
  const beds = (s: ResortState) => tickFlow(s, dem, 0, NOW).stats.beds;
  assert.equal(beds(expand(h.state, h.id)), Math.round((BY_ID.hotel1.beds ?? 0) * (1 + BUILDING_LEVELS.bedsPerLevel)));
});

test("pulling down an expanded car park refunds the decks too", () => {
  const { state, id } = withBuilding("parking");
  const grown = expand(expand(state, id), id);
  const spent = entityCost(findEntity(grown, id)!).coins;
  assert.equal(
    spent,
    BY_ID.parking.cost + Math.round(BY_ID.parking.cost * BUILDING_LEVELS.costShare[0]!) + Math.round(BY_ID.parking.cost * BUILDING_LEVELS.costShare[1]!),
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

/** A lift out of the village with a run back down to it. */
function circuit(): { state: ResortState; pisteId: string } {
  const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
  let state: ResortState = { ...emptyResort(), timeOfDay: 0.5, xp: 999_999, coins: 500_000 };
  state = applyIntent(state, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, BUILT).state;
  const hexes: Axial[] = [];
  for (let r = 1; r <= 9; r++) hexes.push(col(r));
  state = applyIntent(state, { type: "place_piste", itemId: "piste", hexes }, BUILT).state;
  return { state, pisteId: state.pistes[0]!.id };
}

test("a run can be expanded: snow guns, then grooming", () => {
  const { state, pisteId } = circuit();
  const segments = state.pistes[0]!.hexes.length - 1;
  const v = validateIntent(state, dem, { type: "expand", entityId: pisteId }, "builder", NOW);
  assert.ok(v.ok);
  const l2 = expand(state, pisteId);
  assert.equal(l2.pistes[0]!.level, 2);
  assert.equal(l2.coins, state.coins - PISTE_LEVELS.costPerSegment[0]! * segments);
  const l3 = expand(l2, pisteId);
  // Grooming carries more guests per hour.
  assert.ok(capacityOf(l3, pisteId) > capacityOf(l2, pisteId));
  // Snow guns keep it open on some day the plain run is already closed.
  let helped = false;
  for (let day = 1; day <= 120 && !helped; day += 2) {
    const a = capacityOf({ ...state, day }, pisteId);
    const b = capacityOf({ ...l2, day }, pisteId);
    if (b > a) helped = true;
  }
  assert.ok(helped);
  // The refund covers the levels too.
  assert.equal(entityCost(findEntity(l3, pisteId)!).coins, BY_ID.piste.cost * segments + (PISTE_LEVELS.costPerSegment[0]! + PISTE_LEVELS.costPerSegment[1]!) * segments);
});
