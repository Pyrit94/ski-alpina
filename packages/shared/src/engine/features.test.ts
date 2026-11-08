import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import type { Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { PENDING_READY, startMatch } from "./match.ts";
import { emptyResort } from "./state.ts";
import { tickResort } from "./tick.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 5_000_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const me = { id: "p1", name: "Michael" };
const you = { id: "p2", name: "Johanna" };

function act(state: ResortState, intent: Intent, now = NOW, actor = me) {
  const v = validateIntent(state, dem, intent, "builder", now, { actorId: actor.id });
  if (!v.ok) return { state, ok: false as const, reason: v.reason };
  return { state: applyIntent(state, intent, now, actor, dem).state, ok: true as const };
}

/** A restaurant somewhere legal near the village. */
function withRestaurant(): { state: ResortState; id: string } {
  const base: ResortState = { ...emptyResort(), coins: 200_000 };
  for (let dq = -4; dq <= 4; dq++) {
    for (let dr = -4; dr <= 4; dr++) {
      const r = act(base, { type: "place_building", itemId: "restaurant", q: VILLAGE_HEX.q + dq, r: VILLAGE_HEX.r + dr });
      if (r.ok) return { state: r.state, id: r.state.buildings.at(-1)!.id };
    }
  }
  throw new Error("no spot");
}

test("a build can be undone for the full price within the window, by its builder", () => {
  const { state, id } = withRestaurant();
  const before = state.coins + BY_ID.restaurant.cost;
  const undone = act(state, { type: "undo", entityId: id }, NOW + 5_000);
  assert.ok(undone.ok);
  assert.equal(undone.state.coins, before);
  assert.equal(undone.state.buildings.length, 0);
  // Not by someone else, not after the window.
  assert.equal(act(state, { type: "undo", entityId: id }, NOW + 5_000, you).ok, false);
  assert.equal(act(state, { type: "undo", entityId: id }, NOW + (ECONOMY.undoSeconds + 1) * 1000).ok, false);
});

test("a lift undone takes its stations with it, and a run gets its graded price back", () => {
  let s: ResortState = { ...emptyResort(), coins: 200_000 };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, NOW, me, dem).state;
  const hexes: Axial[] = [];
  for (let r = 1; r <= 9; r++) hexes.push(col(r));
  const beforeRun = s.coins;
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes }, NOW, me, dem).state;
  const runUndone = act(s, { type: "undo", entityId: s.pistes[0]!.id }, NOW + 1000);
  assert.ok(runUndone.ok);
  assert.equal(runUndone.state.coins, beforeRun);
  const liftUndone = act(runUndone.state, { type: "undo", entityId: s.lifts[0]!.stationA }, NOW + 1000);
  assert.ok(liftUndone.ok);
  assert.equal(liftUndone.state.lifts.length, 0);
  assert.equal(liftUndone.state.buildings.length, 0);
});

test("in a match, whatever waits for the round end can still be undone", () => {
  let s: ResortState = startMatch({ ...emptyResort() }, "kurz", NOW, dem);
  s = applyIntent(s, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }, NOW, me, dem).state;
  assert.equal(s.lifts[0]!.readyAt, PENDING_READY);
  assert.ok(act(s, { type: "undo", entityId: s.lifts[0]!.id }, NOW + 3_600_000).ok);
});

test("a building moves to a free spot for a small fee", () => {
  const { state, id } = withRestaurant();
  const b = state.buildings[0]!;
  let target: Axial | null = null;
  for (let dq = -4; dq <= 4 && !target; dq++) {
    for (let dr = -4; dr <= 4 && !target; dr++) {
      const t = { q: b.q + dq, r: b.r + dr };
      if ((dq || dr) && validateIntent(state, dem, { type: "move_building", entityId: id, ...t }, "builder", NOW, { actorId: me.id }).ok) target = t;
    }
  }
  assert.ok(target);
  const moved = act(state, { type: "move_building", entityId: id, ...target! });
  assert.ok(moved.ok);
  assert.deepEqual({ q: moved.state.buildings[0]!.q, r: moved.state.buildings[0]!.r }, target);
  assert.equal(moved.state.coins, state.coins - Math.round(BY_ID.restaurant.cost * ECONOMY.moveCostShare));
});

test("free play can be paused and sped up; a match cannot", () => {
  const s = { ...emptyResort(), timeOfDay: 0.4 };
  const paused = act(s, { type: "set_speed", speed: 0 }).state;
  assert.equal(tickResort(paused, dem, 10, NOW).timeOfDay, 0.4);
  const fast = act(s, { type: "set_speed", speed: 3 }).state;
  const normalStep = tickResort(s, dem, 10, NOW).timeOfDay - 0.4;
  const fastStep = tickResort(fast, dem, 10, NOW).timeOfDay - 0.4;
  assert.ok(Math.abs(fastStep - normalStep * 3) < 1e-9);
  assert.equal(act(startMatch(emptyResort(), "kurz", NOW, dem), { type: "set_speed", speed: 0 }).ok, false);
});

test("each finished day leaves a line in the history, bounded", () => {
  let s: ResortState = { ...emptyResort(), timeOfDay: 0.99 };
  for (let i = 0; i < ECONOMY.historyDays + 5; i++) {
    s = tickResort({ ...s, timeOfDay: 0.99 }, dem, ECONOMY.daySecondsReal * 0.02, NOW);
  }
  assert.equal(s.daily?.length, ECONOMY.historyDays);
  assert.ok(s.daily!.every((d) => Number.isFinite(d.income) && d.guests >= 0));
});

test("a lift can be named, through its station too", () => {
  let s: ResortState = { ...emptyResort(), coins: 200_000 };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, NOW, me, dem).state;
  s = act(s, { type: "name_lift", entityId: s.lifts[0]!.stationB, name: "Sunnegga-Express" }).state;
  assert.equal(s.lifts[0]!.name, "Sunnegga-Express");
  s = act(s, { type: "name_lift", entityId: s.lifts[0]!.id, name: "" }).state;
  assert.equal(s.lifts[0]!.name, undefined);
});
