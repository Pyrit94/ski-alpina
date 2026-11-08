import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyResort } from "../../../packages/shared/src/engine/state.ts";
import type { PlacedBuilding } from "../../../packages/shared/src/types.ts";
import { computeNeeds, worstNeed } from "./needs.ts";
import { nextStep } from "./next-step.ts";

const building = (id: string, itemId: PlacedBuilding["itemId"]): PlacedBuilding =>
  ({ id, itemId, q: 0, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 1, cabins: 1, capacity: 1 } }) as PlacedBuilding;

const stats = { ...emptyResort().stats, guestsPerHour: 900, marketPerHour: 5000, beds: 300, waitMinutes: 5 };

test("with one restaurant for 900 guests, food is what is missing most", () => {
  const needs = computeNeeds({ stats, buildings: [building("r", "restaurant"), building("s", "shop")], unlocked: () => true, coins: 100_000 });
  const food = needs.find((n) => n.key === "food")!;
  assert.ok(food.covered < 0.5);
  assert.equal(worstNeed(needs)?.key, "food");
  // 480 seats short: one more restaurant (420) does not close it, so the big hall is offered.
  assert.equal(food.itemId, "gastro-hall");
  assert.match(food.detail, /420 Plätze/);
});

test("a poor location shrinks what a restaurant counts for", () => {
  const b = [building("r", "restaurant")];
  const fine = computeNeeds({ stats, buildings: b, unlocked: () => true, coins: 0 }).find((n) => n.key === "food")!;
  const poor = computeNeeds({ stats, buildings: b, unlocked: () => true, coins: 0, site: new Map([["r", 0.75]]) }).find((n) => n.key === "food")!;
  assert.ok(poor.covered < fine.covered);
});

test("the advisor names the shortest need and offers its building", () => {
  const needs = computeNeeds({ stats, buildings: [], unlocked: (id) => id !== "gastro-hall", coins: 100_000 });
  const lift = {
    id: "l1",
    itemId: "chair" as const,
    a: { q: 0, r: 0 },
    b: { q: 0, r: 8 },
    stationA: "a",
    stationB: "b",
    level: 1,
    builtAt: 0,
    readyAt: 0,
    upgrades: { speed: 1, cabins: 1, capacity: 1 },
  };
  const piste = { id: "p1", itemId: "piste" as const, difficulty: "blue" as const, hexes: [{ q: 0, r: 8 }, { q: 0, r: 0 }], builtAt: 0, readyAt: 0 };
  const step = nextStep({
    lifts: [lift],
    pistes: [piste],
    buildings: [],
    stats,
    flow: [],
    links: new Map(),
    unlocked: () => true,
    coins: 100_000,
    needs,
  });
  assert.ok(step?.id.startsWith("need-"), step?.id);
  assert.equal(step?.action?.kind, "build");
});
