import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyResort } from "./state.ts";
import { applyIntent } from "./apply.ts";
import { validateIntent } from "./validate.ts";
import { tickFlow } from "./flow.ts";
import { generateDem } from "../terrain/dem.ts";
import { tickResort } from "./tick.ts";

const dem = generateDem();

test("client cannot mint coins: only applyIntent after validate", () => {
  const state = emptyResort();
  const start = state.coins;
  const intent = { type: "place_building" as const, itemId: "parking" as const, q: -4, r: 7 };
  const v = validateIntent(state, dem, intent, "builder", Date.now());
  assert.equal(v.ok, true);
  const next = applyIntent(state, intent, Date.now()).state;
  assert.equal(next.coins < start, true);
});

test("visitor has no build rights", () => {
  const state = emptyResort();
  const v = validateIntent(
    state,
    dem,
    { type: "place_building", itemId: "parking", q: -4, r: 7 },
    "visitor",
    Date.now(),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, "rights");
});

test("too expensive is rejected", () => {
  const state = { ...emptyResort(), coins: 10, xp: 50000 };
  const v = validateIntent(
    state,
    dem,
    { type: "place_building", itemId: "hotel5", q: -4, r: 7 },
    "builder",
    Date.now(),
  );
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.code, "budget");
});

test("flow throughput never exceeds lift capacity", () => {
  let state = emptyResort();
  const now = 1_000_000;
  state = applyIntent(state, { type: "place_lift", itemId: "tbar", a: { q: 0, r: 12 }, b: { q: 0, r: 4 } }, now - 60_000).state;
  state = applyIntent(
    state,
    {
      type: "place_piste",
      itemId: "piste-blue",
      hexes: [
        { q: 0, r: 4 },
        { q: 0, r: 6 },
        { q: 0, r: 8 },
        { q: 0, r: 10 },
        { q: 0, r: 12 },
      ],
    },
    now - 60_000,
  ).state;
  const flowed = tickFlow(state, dem, 0.2, now);
  const lift = flowed.flow.find((e) => e.kind === "lift");
  assert.ok(lift);
  assert.ok(lift.flow <= lift.capacity + 1e-6);
  assert.ok(flowed.stats.peoplePerHour <= lift.capacity + 1);
});

test("tick is deterministic for same inputs", () => {
  const a = emptyResort();
  const b = emptyResort();
  const t1 = tickResort(a, dem, 1, 50_000);
  const t2 = tickResort(b, dem, 1, 50_000);
  assert.equal(t1.coins, t2.coins);
  assert.equal(t1.timeOfDay, t2.timeOfDay);
});

test("piste must go downhill", () => {
  const state = emptyResort();
  const v = validateIntent(
    state,
    dem,
    {
      type: "place_piste",
      itemId: "piste-blue",
      hexes: [
        { q: 0, r: 16 },
        { q: -2, r: -18 },
      ],
    },
    "builder",
    Date.now(),
  );
  assert.equal(v.ok, false);
});
