import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyResort } from "../../../packages/shared/src/engine/state.ts";
import type { EdgeLink } from "../../../packages/shared/src/engine/descent.ts";
import type { FlowEdgeViz, PlacedBuilding, PlacedLift, PlacedPiste } from "../../../packages/shared/src/types.ts";
import { nextStep, type StepInput } from "./next-step.ts";

const lift = (id: string): PlacedLift => ({
  id,
  itemId: "chair",
  a: { q: 0, r: 0 },
  b: { q: 0, r: 8 },
  stationA: `${id}-a`,
  stationB: `${id}-b`,
  level: 1,
  builtAt: 0,
  readyAt: 0,
  upgrades: { speed: 1, cabins: 1, capacity: 1 },
});
const piste = (id: string, difficulty: PlacedPiste["difficulty"] = "blue"): PlacedPiste => ({
  id,
  itemId: "piste",
  difficulty,
  hexes: [{ q: 0, r: 8 }, { q: 0, r: 0 }],
  builtAt: 0,
  readyAt: 0,
});
const building = (id: string, itemId: PlacedBuilding["itemId"]): PlacedBuilding =>
  ({ id, itemId, q: 0, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 1, cabins: 1, capacity: 1 } }) as PlacedBuilding;

function input(over: Partial<StepInput> = {}): StepInput {
  return {
    lifts: [],
    pistes: [],
    buildings: [],
    stats: { ...emptyResort().stats },
    flow: [],
    links: new Map<string, EdgeLink>(),
    unlocked: () => true,
    coins: 100_000,
    ...over,
  };
}

test("first a lift, then its descent", () => {
  assert.equal(nextStep(input())?.id, "first-lift");
  const step = nextStep(input({ lifts: [lift("l1")], links: new Map([["l1", "no-descent"]]) }));
  assert.equal(step?.action?.kind, "descent");
  assert.equal(step?.actionLabel, "Abfahrt anlegen");
});

test("guests turned away at the door come before growth", () => {
  const step = nextStep(
    input({
      lifts: [lift("l1")],
      pistes: [piste("p1")],
      links: new Map<string, EdgeLink>([["l1", "ok"], ["p1", "ok"]]),
      stats: { ...emptyResort().stats, turnedAway: 80 },
    }),
  );
  assert.equal(step?.id, "turned-away");
  assert.deepEqual(step?.action, { kind: "build", itemId: "parking" });
});

test("a nearly empty lift is explained as missing guests, not missing capacity", () => {
  const flow: FlowEdgeViz[] = [{ id: "l1", kind: "lift", from: { q: 0, r: 0 }, to: { q: 0, r: 8 }, flow: 60, capacity: 2484 }];
  const step = nextStep(
    input({
      lifts: [lift("l1")],
      pistes: [piste("p1"), piste("p2", "red")],
      buildings: [building("b1", "parking"), building("b2", "restaurant")],
      links: new Map<string, EdgeLink>([["l1", "ok"], ["p1", "ok"], ["p2", "ok"]]),
      flow,
    }),
  );
  assert.equal(step?.id, "empty-lifts");
  assert.match(step!.text, /fehlen Gäste/);
});

test("one colour of run only: suggest another", () => {
  const step = nextStep(
    input({
      lifts: [lift("l1")],
      pistes: [piste("p1")],
      links: new Map<string, EdgeLink>([["l1", "ok"], ["p1", "ok"]]),
    }),
  );
  assert.equal(step?.id, "variety");
  assert.equal(step?.action?.kind, "piste-from");
});

test("a saturated bottleneck asks to be upgraded", () => {
  const step = nextStep(
    input({
      lifts: [lift("l1")],
      pistes: [piste("p1")],
      links: new Map<string, EdgeLink>([["l1", "ok"], ["p1", "ok"]]),
      stats: { ...emptyResort().stats, bottleneckId: "l1", bottleneckLabel: "Sessellift", bottleneckUse: 0.97 },
    }),
  );
  assert.equal(step?.id, "bottleneck-l1");
  assert.deepEqual(step?.action, { kind: "select", id: "l1" });
});

test("idle research is suggested once the resort runs, with the node to start", () => {
  const running = {
    lifts: [lift("l1")],
    pistes: [piste("p1"), piste("p2", "red")],
    links: new Map<string, EdgeLink>([["l1", "ok"], ["p1", "ok"], ["p2", "ok"]]),
    buildings: [building("b1", "parking"), building("b2", "restaurant")],
  };
  const idle = nextStep(input({ ...running, research: { busy: false, next: { id: "gastgewerbe", name: "Gastgewerbe" } } }));
  assert.deepEqual(idle?.action, { kind: "research", nodeId: "gastgewerbe" });
  // Running research, or none to start: no such tip.
  const busy = nextStep(input({ ...running, research: { busy: true, next: { id: "gastgewerbe", name: "Gastgewerbe" } } }));
  assert.notEqual(busy?.action?.kind, "research");
});
