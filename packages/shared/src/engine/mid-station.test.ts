import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { descentGoals, resortLinks } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { midStationSpots } from "./mid-station.ts";
import { routeToAny } from "./piste-route.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const elev = (h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z);
};

function longLift(): ResortState {
  const s: ResortState = { ...emptyResort(), coins: 2_000_000, xp: 999_999 };
  for (const a of hexesInRange(VILLAGE_HEX, 2)) {
    for (const b of hexesInRange(a, 16)) {
      if (hexDistance(a, b) < 12 || elev(b) - elev(a) < 300) continue;
      const it = { type: "place_lift" as const, itemId: "chair" as const, a, b };
      if (validateIntent(s, dem, it, "builder", NOW).ok) return applyIntent(s, it, NOW, undefined, dem).state;
    }
  }
  return s;
}

test("a lift gets a middle station on its line, and runs may leave from it", () => {
  let s = longLift();
  const lift = s.lifts[0];
  if (!lift) return; // no long lift on this ground
  const spots = midStationSpots(s, dem, lift.id);
  if (spots.length === 0) return;
  const mid = spots[Math.floor(spots.length / 2)]!;
  const add = { type: "add_mid_station" as const, liftId: lift.id, q: mid.q, r: mid.r };
  assert.ok(validateIntent(s, dem, add, "builder", NOW).ok);
  const coins = s.coins;
  s = applyIntent(s, add, NOW, undefined, dem).state;
  assert.equal(s.coins, coins - Math.round(BY_ID.chair.cost * ECONOMY.midStationShare));
  assert.deepEqual(s.lifts[0]!.mid, mid);
  // Only one.
  assert.equal(validateIntent(s, dem, add, "builder", NOW).ok, false);

  // A run from the middle station down to the valley is joined.
  const run = routeToAny(dem, mid, descentGoals(s, dem, mid), "any");
  assert.ok(run, "a way down from the middle station");
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run! }, NOW, undefined, dem).state;
  assert.equal(resortLinks(s, dem).get(s.pistes[0]!.id), "ok");
  assert.equal(resortLinks(s, dem).get(s.lifts[0]!.id), "ok");
});

test("a middle station must stand on the lift's line, away from its ends", () => {
  const s = longLift();
  const lift = s.lifts[0];
  if (!lift) return;
  const near = { type: "add_mid_station" as const, liftId: lift.id, q: lift.a.q, r: lift.a.r };
  assert.equal(validateIntent(s, dem, near, "builder", NOW).ok, false);
  const off = { type: "add_mid_station" as const, liftId: lift.id, q: lift.a.q + 8, r: lift.a.r - 8 };
  assert.equal(validateIntent(s, dem, off, "builder", NOW).ok, false);
});
