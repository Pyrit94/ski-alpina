import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSeen, markSeen, nextHint, SEEN_KEY, type HintStorage } from "./discover.ts";
import type { AssistFacts } from "./helper-status.ts";

const quiet: AssistFacts = {
  lifts: 1,
  liftsWithoutDescent: 0,
  runs: 1,
  lowRun: null,
  lowRuns: 0,
  villageAverage: 0.9,
  midCandidate: null,
  neighboursOn: true,
  topNeighbour: null,
  allPacts: false,
  buyable: null,
  researchUnlock: null,
  mix: "mixed",
};
const calm = { busy: false, urgent: false };
const none = new Set<string>();

test("nothing to introduce, no hint", () => {
  assert.equal(nextHint(quiet, none, calm), null);
});

test("a lift long enough for a middle station opens its planner", () => {
  const h = nextHint({ ...quiet, midCandidate: { liftId: "l1", name: "Sessellift 2" } }, none, calm)!;
  assert.equal(h.id, "midstation");
  assert.match(h.text, /Sessellift 2 ist lang genug/);
  assert.deepEqual(h.action, { kind: "helper", open: { id: "midstation", liftId: "l1" }, focus: "lift" });
});

test("a neighbour taking 5 % or more opens its card; less stays quiet", () => {
  const h = nextHint({ ...quiet, topNeighbour: { id: "nb1", name: "Corvatsch", share: 0.09 } }, none, calm)!;
  assert.equal(h.id, "neighbour");
  assert.match(h.text, /Corvatsch nimmt euch 9\s%/);
  assert.deepEqual(h.action, { kind: "helper", open: { id: "neighbour", neighbourId: "nb1" }, focus: "neighbour" });
  assert.equal(nextHint({ ...quiet, topNeighbour: { id: "nb1", name: "Corvatsch", share: 0.04 } }, none, calm), null);
});

test("money enough for a neighbour's estimate offers the purchase", () => {
  const h = nextHint({ ...quiet, buyable: { id: "nb2", name: "Diavolezza", estimate: 90_000 } }, none, calm)!;
  assert.equal(h.id, "buyout");
  assert.deepEqual(h.action, { kind: "helper", open: { id: "neighbour", neighbourId: "nb2" }, focus: "neighbour" });
});

test("a weak run points to «Pisten optimieren»", () => {
  const h = nextHint({ ...quiet, lowRun: { id: "p1", name: "Talabfahrt", points: 22 }, lowRuns: 1 }, none, calm)!;
  assert.equal(h.id, "reshape");
  assert.match(h.text, /22 Punkte/);
  assert.deepEqual(h.action, { kind: "helper", open: { id: "reshape" } });
});

test("a poor village location points to «Dorf ordnen», a fair one does not", () => {
  const h = nextHint({ ...quiet, villageAverage: 0.64 }, none, calm)!;
  assert.equal(h.id, "village");
  assert.match(h.text, /64\s%/);
  assert.equal(nextHint({ ...quiet, villageAverage: 0.7 }, none, calm), null);
  assert.equal(nextHint({ ...quiet, villageAverage: null }, none, calm), null);
});

test("finished research that unlocks something opens the build menu on its category", () => {
  const h = nextHint(
    { ...quiet, researchUnlock: { nodeId: "gondel", itemId: "gondola", itemName: "Gondelbahn", category: "lifts" } },
    none,
    calm,
  )!;
  assert.equal(h.id, "unlock:gondola");
  assert.deepEqual(h.action, { kind: "build", category: "lifts" });
});

test("each hint once: a seen one gives way to the next", () => {
  const facts: AssistFacts = { ...quiet, midCandidate: { liftId: "l1", name: "Sessellift" }, villageAverage: 0.5 };
  assert.equal(nextHint(facts, none, calm)?.id, "midstation");
  assert.equal(nextHint(facts, new Set(["midstation"]), calm)?.id, "village");
  assert.equal(nextHint(facts, new Set(["midstation", "village"]), calm), null);
});

test("priority: research, neighbour, purchase, middle station, runs, village", () => {
  const all: AssistFacts = {
    ...quiet,
    researchUnlock: { nodeId: "n", itemId: "gondola", itemName: "Gondelbahn", category: "lifts" },
    topNeighbour: { id: "nb1", name: "A", share: 0.1 },
    buyable: { id: "nb1", name: "A", estimate: 1 },
    midCandidate: { liftId: "l1", name: "L" },
    lowRun: { id: "p", name: "P", points: 10 },
    lowRuns: 1,
    villageAverage: 0.5,
  };
  const order: string[] = [];
  let seen = new Set<string>();
  for (let h = nextHint(all, seen, calm); h; h = nextHint(all, seen, calm)) {
    order.push(h.id);
    seen = new Set([...seen, h.id]);
  }
  assert.deepEqual(order, ["unlock:gondola", "neighbour", "buyout", "midstation", "reshape", "village"]);
});

test("never while something else is open, or while there is something to fix", () => {
  const facts: AssistFacts = { ...quiet, villageAverage: 0.5 };
  assert.equal(nextHint(facts, none, { busy: true, urgent: false }), null);
  assert.equal(nextHint(facts, none, { busy: false, urgent: true }), null);
});

test("seen hints survive in storage, and broken storage is no error", () => {
  const box = new Map<string, string>();
  const storage: HintStorage = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => void box.set(k, v) };
  const seen = markSeen(storage, loadSeen(storage), "village");
  assert.deepEqual([...loadSeen(storage)], ["village"]);
  assert.deepEqual([...markSeen(storage, seen, "reshape")].sort(), ["reshape", "village"]);

  const broken: HintStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.equal(loadSeen(broken).size, 0);
  assert.deepEqual([...markSeen(broken, new Set(), "x")], ["x"]);
  box.set(SEEN_KEY, "{kaputt");
  assert.equal(loadSeen(storage).size, 0);
  assert.equal(loadSeen(null).size, 0);
});
