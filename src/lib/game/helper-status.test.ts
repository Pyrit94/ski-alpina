import assert from "node:assert/strict";
import { test } from "node:test";
import { autoStatus, helperRows, midStationStatus, neighbourStatus, reshapeStatus, usefulCount, villageStatus, type AssistFacts } from "./helper-status.ts";
import { helperOf, openHelperPatch, sameHelper, toggleHelperPatch, type HelperOpen } from "./helpers.ts";

const base: AssistFacts = {
  lifts: 2,
  liftsWithoutDescent: 0,
  runs: 3,
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

test("status lines say what each helper would do here", () => {
  assert.equal(autoStatus({ ...base, liftsWithoutDescent: 2 }).status, "2 Bahnen ohne Abfahrt");
  assert.equal(autoStatus({ ...base, liftsWithoutDescent: 1 }).status, "1 Bahn ohne Abfahrt");
  assert.equal(villageStatus({ ...base, villageAverage: 0.78 }).status, "Lage im Schnitt 78 %");
  assert.equal(reshapeStatus({ ...base, lowRuns: 3 }).status, "3 Pisten haben wenig Punkte");
  assert.equal(neighbourStatus({ ...base, topNeighbour: { id: "nb1", name: "Corvatsch", share: 0.09 } })?.status, "Corvatsch nimmt euch 9 %");
  assert.equal(midStationStatus({ ...base, midCandidate: { liftId: "l2", name: "Sesselbahn 2" } }).status, "Sesselbahn 2 ist lang genug");
});

test("what a row opens", () => {
  assert.deepEqual(autoStatus({ ...base, mix: "red" }).open, { id: "auto", liftIds: null, mix: "red" });
  assert.deepEqual(neighbourStatus({ ...base, topNeighbour: { id: "nb1", name: "C", share: 0.09 } })?.open, { id: "neighbour", neighbourId: "nb1" });
  assert.deepEqual(midStationStatus({ ...base, midCandidate: { liftId: "l2", name: "S" } }).open, { id: "midstation", liftId: "l2" });
});

test("helpers with nothing to work on are greyed, and neighbours off leaves their row out", () => {
  assert.equal(villageStatus({ ...base, villageAverage: null }).open, null);
  assert.equal(reshapeStatus({ ...base, runs: 0 }).open, null);
  assert.equal(midStationStatus(base).open, null);
  assert.equal(midStationStatus({ ...base, lifts: 0 }).status, "Erst eine Bahn bauen");
  assert.equal(neighbourStatus({ ...base, neighboursOn: false }), null);
  assert.equal(helperRows({ ...base, neighboursOn: false }).length, 4);
  assert.equal(neighbourStatus({ ...base, allPacts: true })?.status, "Tarifverbund mit allen");
});

test("a neighbour for sale outranks one that only takes guests", () => {
  const row = neighbourStatus({ ...base, topNeighbour: { id: "a", name: "A", share: 0.02 }, buyable: { id: "b", name: "B", estimate: 5 } })!;
  assert.equal(row.status, "B wäre zu kaufen");
  assert.deepEqual(row.open, { id: "neighbour", neighbourId: "b" });
});

test("rows sort by usefulness: a missing way down first, a poor village before weak runs", () => {
  const rows = helperRows({
    ...base,
    liftsWithoutDescent: 1,
    villageAverage: 0.6,
    lowRuns: 2,
    topNeighbour: { id: "nb1", name: "C", share: 0.01 },
    midCandidate: { liftId: "l", name: "L" },
  });
  assert.deepEqual(
    rows.map((r) => r.id),
    ["auto", "village", "reshape", "midstation", "neighbour"],
  );
  assert.equal(usefulCount(rows), 3);
  // Nothing to do anywhere: the original order holds.
  assert.deepEqual(
    helperRows({ ...base, lifts: 0, runs: 0, villageAverage: null }).map((r) => r.id),
    ["auto", "village", "reshape", "neighbour", "midstation"],
  );
});

test("one helper open at a time: opening one replaces the other", () => {
  let open: HelperOpen | null = null;
  open = openHelperPatch({ id: "auto", liftIds: null, mix: "mixed" }).helper;
  assert.equal(helperOf(open, "auto")?.mix, "mixed");
  open = openHelperPatch({ id: "village" }).helper;
  assert.equal(helperOf(open, "auto"), null);
  assert.notEqual(helperOf(open, "village"), null);
  // Opening makes way: the sheet closes and the selection goes.
  assert.deepEqual(openHelperPatch({ id: "reshape" }), { helper: { id: "reshape" }, sheet: "none", selectedId: null });
  assert.deepEqual(openHelperPatch(null), { helper: null });
});

test("toggling: the same helper closes, another neighbour's card replaces", () => {
  const nb1: HelperOpen = { id: "neighbour", neighbourId: "nb1" };
  const nb2: HelperOpen = { id: "neighbour", neighbourId: "nb2" };
  assert.equal(toggleHelperPatch(nb1, nb1).helper, null);
  assert.deepEqual(toggleHelperPatch(nb1, nb2).helper, nb2);
  assert.equal(toggleHelperPatch({ id: "hub" }, { id: "hub" }).helper, null);
  assert.equal(sameHelper({ id: "midstation", liftId: "a" }, { id: "midstation", liftId: "b" }), false);
  assert.equal(sameHelper(null, { id: "hub" }), false);
});
