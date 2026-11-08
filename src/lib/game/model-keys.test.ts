import assert from "node:assert/strict";
import { test } from "node:test";
import { HOUSE_KEYS, LIFT_TYPES, houseVariant, modelKeyFor, modelKeysFor } from "./model-keys.ts";

const having = (...keys: string[]) => (k: string) => keys.includes(k);

test("a station tries its lift type, then the shared station, then the built-in", () => {
  assert.deepEqual(modelKeysFor("station", "chair"), ["station-chair", "station"]);
  assert.equal(modelKeyFor("station", "chair", having("station-chair", "station")), "station-chair");
  assert.equal(modelKeyFor("station", "chair", having("station", "station-gondola")), "station");
  assert.equal(modelKeyFor("station", "chair", having("station-gondola")), null);
  assert.equal(modelKeyFor("station", "cog", having("station-cog")), "station-cog");
});

test("a mid station tries station-mid first", () => {
  assert.deepEqual(modelKeysFor("station-mid", "gondola"), ["station-mid", "station-gondola", "station"]);
  assert.equal(modelKeyFor("station-mid", "gondola", having("station-mid", "station-gondola")), "station-mid");
  assert.equal(modelKeyFor("station-mid", "gondola", having("station-gondola", "station")), "station-gondola");
  assert.equal(modelKeyFor("station-mid", "gondola", having("station")), "station");
  assert.equal(modelKeyFor("station-mid", "gondola", having()), null);
});

test("carriers: tram cabin falls back to the gondola cabin", () => {
  assert.equal(modelKeyFor("carrier", "tram", having("carrier-tram", "carrier-cabin")), "carrier-tram");
  assert.equal(modelKeyFor("carrier", "tram", having("carrier-cabin")), "carrier-cabin");
  assert.equal(modelKeyFor("carrier", "tram", having()), null);
  assert.equal(modelKeyFor("carrier", "cog", having("carrier-train")), "carrier-train");
  assert.equal(modelKeyFor("carrier", "chair", having("carrier-chair")), "carrier-chair");
  assert.equal(modelKeyFor("carrier", "tbar", having("carrier-cabin")), null);
  for (const id of ["gondola", "funitel", "glacier"]) {
    assert.equal(modelKeyFor("carrier", id, having("carrier-cabin", "carrier-tram")), "carrier-cabin");
  }
  // Every lift type has a chain.
  for (const id of LIFT_TYPES) assert.ok(modelKeysFor("carrier", id).length > 0);
});

test("house variants are stable and only use files that are there", () => {
  assert.equal(houseVariant(3, []), null);
  const some = ["house-2", "house-5"];
  const picks = Array.from({ length: 60 }, (_, i) => houseVariant(i, some));
  assert.ok(picks.every((p) => p !== null && some.includes(p)));
  assert.ok(new Set(picks).size === 2, "both variants show up");
  assert.deepEqual(picks, Array.from({ length: 60 }, (_, i) => houseVariant(i, some)));
  const all = new Set(Array.from({ length: 200 }, (_, i) => houseVariant(i, HOUSE_KEYS)));
  assert.equal(all.size, HOUSE_KEYS.length);
});
