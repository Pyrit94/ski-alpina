import assert from "node:assert/strict";
import { test } from "node:test";
import { BY_ID } from "../../../config/src/items.ts";
import { ECONOMY } from "../../../config/src/economy.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import { IntentSchema } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { suggestDescent } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { ensureMatchPlayers } from "./match.ts";
import { midStationCost, midStationSpots } from "./mid-station.ts";
import { neighbourHexes } from "./neighbours.ts";
import { emptyResort, entityCost, findEntity } from "./state.ts";
import { validateIntent } from "./validate.ts";

/**
 * Bugs a review found, each pinned so it stays fixed.
 */

const dem = generateDem();
const NOW = 1_000_000;
const elev = (h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z);
};

function game(coins = 2_000_000) {
  let s: ResortState = { ...emptyResort(), coins, xp: 999_999 };
  const act = (it: Intent, actorId?: string, now = NOW) => {
    const v = validateIntent(s, dem, it, "builder", now, { actorId });
    if (!v.ok) return v;
    s = applyIntent(s, it, now, actorId ? { id: actorId, name: actorId } : undefined, dem).state;
    return v;
  };
  return { get s() { return s; }, set s(v: ResortState) { s = v; }, act };
}

function placeLift(g: ReturnType<typeof game>, actorId?: string, minSpan = 6) {
  for (const a of hexesInRange(VILLAGE_HEX, 3)) {
    for (const b of hexesInRange(a, 12)) {
      if (hexDistance(a, b) < minSpan || elev(b) - elev(a) < 200) continue;
      if (g.act({ type: "place_lift", itemId: "chair", a, b }, actorId).ok) return g.s.lifts[g.s.lifts.length - 1]!;
    }
  }
  throw new Error("no lift fits");
}

test("a purse named after an object built-in is not a purse", () => {
  const g = game();
  g.act({ type: "start_match", preset: "normal", options: { economy: "duel" } }, "pA");
  g.s = ensureMatchPlayers(g.s, ["pA", "pB"]);
  for (const to of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const it = IntentSchema.parse({ type: "transfer_coins", to, amount: 1000 });
    assert.equal(g.act(it, "pA").ok, false, to);
  }
  assert.ok(Number.isFinite(g.s.coins));
});

test("in a duel, what the other one built is theirs: no demolish, upgrade or move", () => {
  const g = game();
  g.act({ type: "start_match", preset: "normal", options: { economy: "duel" } }, "pA");
  g.s = ensureMatchPlayers(g.s, ["pA", "pB"]);
  const lift = placeLift(g, "pA");
  const later = NOW + 600_000;
  assert.equal(g.act({ type: "demolish", entityId: lift.id }, "pB", later).ok, false);
  assert.equal(g.act({ type: "upgrade", entityId: lift.id, key: "speed" }, "pB", later).ok, false);
  assert.equal(g.s.lifts.length, 1);
  // Their own, they may.
  assert.equal(g.act({ type: "demolish", entityId: lift.id }, "pA", later).ok, true);
});

test("a match starts with fresh neighbours, and they cannot be switched mid-match", () => {
  const g = game();
  g.act({ type: "set_neighbours", mode: "gemuetlich" });
  const before = g.s.neighbours!.list.length;
  assert.ok(before > 0);
  g.act({ type: "start_match", preset: "normal" });
  assert.equal(g.s.neighbours?.mode, "gemuetlich");
  assert.equal(g.s.neighbours!.list.length, before);
  assert.equal(g.act({ type: "set_neighbours", mode: "off" }).ok, false);
  g.act({ type: "free_play" });
  assert.equal(g.s.neighbours?.mode, "gemuetlich", "free play keeps them");
});

test("switched back on, neighbours never stand on what was built while they were off", () => {
  const g = game();
  g.act({ type: "set_neighbours", mode: "gemuetlich" });
  const run = g.s.neighbours!.list[0]!.pistes[0]!;
  g.act({ type: "set_neighbours", mode: "off" });
  assert.equal(g.act({ type: "place_piste", itemId: "piste", hexes: run.hexes }).ok, true);
  g.act({ type: "set_neighbours", mode: "gemuetlich" });
  const theirs = neighbourHexes(g.s);
  for (const p of g.s.pistes) for (const h of p.hexes) assert.equal(theirs.has(`${h.q},${h.r}`), false);
});

test("the suggested way down goes around a neighbour's runs", () => {
  const g = game();
  g.act({ type: "set_neighbours", mode: "gemuetlich" });
  const theirs = neighbourHexes(g.s);
  let checked = 0;
  for (const n of g.s.neighbours!.list) {
    for (const a of hexesInRange(n.base, 8)) {
      for (const b of hexesInRange(a, 9)) {
        if (hexDistance(a, b) < 5 || checked >= 25) continue;
        const it: Intent = { type: "place_lift", itemId: "chair", a, b };
        if (!validateIntent(g.s, dem, it, "builder", NOW).ok) continue;
        const s = applyIntent(g.s, it, NOW, undefined, dem).state;
        const route = suggestDescent(s, dem, s.lifts[s.lifts.length - 1]!.id, "blue");
        if (!route) continue;
        checked++;
        assert.ok(route.every((h) => !theirs.has(`${h.q},${h.r}`)), "never on their ground");
        assert.ok(validateIntent(s, dem, { type: "place_piste", itemId: "piste", hexes: route }, "builder", NOW).ok);
      }
    }
  }
  assert.ok(checked > 0);
});

test("a middle station: priced once with the discount, refunded in full on undo, counted when demolished", () => {
  const g = game(500_000);
  const lift = placeLift(g, "pA", 12);
  const mid = midStationSpots(g.s, dem, lift.id)[0]!;
  assert.equal(midStationCost(g.s, "chair"), Math.round(BY_ID.chair.cost * ECONOMY.midStationShare));
  g.act({ type: "add_mid_station", liftId: lift.id, q: mid.q, r: mid.r }, "pA");
  const entity = findEntity(g.s, lift.id)!;
  assert.equal(entityCost(entity).coins, BY_ID.chair.cost + Math.round(BY_ID.chair.cost * ECONOMY.midStationShare));
  assert.ok(g.act({ type: "undo", entityId: lift.id }, "pA", NOW + 1000).ok);
  assert.equal(g.s.coins, 500_000, "all of it back");
});

test("«Dorf ordnen» cannot put a building on a middle station", () => {
  const g = game();
  const lift = placeLift(g, undefined, 12);
  const mid = midStationSpots(g.s, dem, lift.id)[0]!;
  g.act({ type: "add_mid_station", liftId: lift.id, q: mid.q, r: mid.r });
  let placed: string | null = null;
  for (const h of hexesInRange(VILLAGE_HEX, 3)) {
    if (g.act({ type: "place_building", itemId: "restaurant", q: h.q, r: h.r }).ok) {
      placed = g.s.buildings[g.s.buildings.length - 1]!.id;
      break;
    }
  }
  assert.ok(placed);
  const v = validateIntent(g.s, dem, { type: "rearrange", moves: [{ entityId: placed!, q: mid.q, r: mid.r }] }, "builder", NOW);
  assert.equal(v.ok, false);
});
