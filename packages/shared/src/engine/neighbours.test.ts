import assert from "node:assert/strict";
import { test } from "node:test";
import { NEIGHBOURS, SEASON } from "../../../config/src/economy.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { suggestDescent } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { PENDING_READY } from "./match.ts";
import { absDay, neighbourCut, neighbourHexes, neighbourKm, neighbourOf, neighboursDayEnded, setNeighbourMode } from "./neighbours.ts";
import { emptyResort } from "./state.ts";
import { validateHex, validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const elev = (h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z);
};

/** A small resort of the players' own: one lift from the village and a run down. */
function ownResort(): ResortState {
  let s: ResortState = { ...emptyResort(), coins: 2_000_000, xp: 999_999 };
  outer: for (const a of hexesInRange(VILLAGE_HEX, 2)) {
    for (const b of hexesInRange(a, 12)) {
      if (hexDistance(a, b) < 8 || elev(b) - elev(a) < 250) continue;
      const it = { type: "place_lift" as const, itemId: "chair" as const, a, b };
      if (validateIntent(s, dem, it, "builder", NOW).ok) {
        s = applyIntent(s, it, NOW, undefined, dem).state;
        const run = suggestDescent(s, dem, s.lifts[0]!.id, "any");
        if (run) s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run }, NOW, undefined, dem).state;
        break outer;
      }
    }
  }
  return s;
}

test("neighbours appear away from the village, each with lifts and a run per lift", () => {
  const s = setNeighbourMode(ownResort(), dem, "gemuetlich", NOW);
  const list = s.neighbours!.list;
  assert.ok(list.length >= 1, "at least one neighbour on the classic map");
  for (const n of list) {
    assert.ok(hexDistance(n.base, dem.region.villageHex) >= NEIGHBOURS.minDistance);
    assert.ok(n.lifts.length >= 1);
    assert.equal(n.pistes.length, n.lifts.length);
    assert.equal(n.buildings.length, n.lifts.length * 2);
    for (const id of [...n.lifts, ...n.pistes, ...n.buildings].map((e) => e.id)) assert.equal(neighbourOf(id), n.id);
    // Nothing on or right beside what the players have.
    for (const p of n.pistes) {
      for (const h of p.hexes) {
        for (const l of s.lifts) assert.ok(hexDistance(h, l.a) > NEIGHBOURS.clearance && hexDistance(h, l.b) > NEIGHBOURS.clearance);
      }
    }
  }
  if (list.length > 1) assert.ok(hexDistance(list[0]!.base, list[1]!.base) >= NEIGHBOURS.apart);
});

test("the same map gets the same neighbours", () => {
  const a = setNeighbourMode(emptyResort(), dem, "gemuetlich", NOW).neighbours!.list;
  const b = setNeighbourMode(emptyResort(), dem, "gemuetlich", NOW).neighbours!.list;
  assert.deepEqual(a, b);
});

test("a neighbour's stations and runs cannot be built on", () => {
  const s = setNeighbourMode(emptyResort(), dem, "gemuetlich", NOW);
  const n = s.neighbours!.list[0]!;
  const station = n.buildings[0]!;
  const v = validateHex(s, dem, station.q, station.r, "restaurant");
  assert.equal(v.ok, false);
  assert.match(v.ok ? "" : v.reason, new RegExp(n.name));
  const onRun = n.pistes[0]!.hexes[2]!;
  assert.equal(validateHex(s, dem, onRun.q, onRun.r, "piste").ok, false);
  assert.ok(neighbourHexes(s).has(`${onRun.q},${onRun.r}`));
  // Switched off, the ground is free again.
  const off = setNeighbourMode(s, dem, "off", NOW);
  assert.equal(neighbourHexes(off).size, 0);
});

test("neighbours take a share of the guests, less the bigger your own area", () => {
  const s = setNeighbourMode(emptyResort(), dem, "gemuetlich", NOW);
  assert.equal(neighbourCut(emptyResort(), 3), 0);
  const small = neighbourCut(s, 1);
  const big = neighbourCut(s, 20);
  assert.ok(small > big && big > 0);
  assert.ok(small <= NEIGHBOURS.maxCut);

  const own = ownResort();
  assert.equal(own.pistes.length, 1, "a run of the players' own");
  const day = { day: 10, timeOfDay: 0.5 };
  const alone = tickFlow({ ...own, ...day }, dem, 0, PENDING_READY).stats;
  const shared = tickFlow({ ...setNeighbourMode(own, dem, "gemuetlich", NOW), ...day }, dem, 0, PENDING_READY).stats;
  assert.ok(shared.neighbourCut! > 0);
  assert.ok(shared.marketPerHour < alone.marketPerHour);
  assert.ok(shared.marketPerHour >= alone.marketPerHour * (1 - NEIGHBOURS.maxCut) - 1);
});

test("a neighbour earns from its guests and builds now and then, never too often", () => {
  let s = setNeighbourMode({ ...emptyResort(), day: 5 }, dem, "gemuetlich", NOW);
  const first = s.neighbours!.list[0]!;
  const lifts = first.lifts.length;
  let built = 0;
  let last = absDay(s);
  for (let d = 0; d < 30; d++) {
    const ns = neighboursDayEnded(s, dem, NOW)!;
    const n = ns.list[0]!;
    assert.ok(n.guestsYesterday >= 0);
    if (n.lifts.length > s.neighbours!.list[0]!.lifts.length) {
      built++;
      assert.ok(absDay(s) - last >= NEIGHBOURS.growEveryDays || built === 1);
      last = absDay(s);
    }
    s = { ...s, neighbours: ns, day: (s.day % SEASON.daysPerYear) + 1 };
  }
  const n = s.neighbours!.list[0]!;
  assert.ok(n.guestsYesterday > 0 || neighbourKm(n) === 0);
  assert.ok(n.lifts.length <= NEIGHBOURS.maxLifts);
  assert.ok(n.lifts.length >= lifts);
});

test("«Nachbarn» is a setting: on, off, and on again keeps the same areas", () => {
  const s = emptyResort();
  const on = applyIntent(s, { type: "set_neighbours", mode: "gemuetlich" }, NOW, undefined, dem).state;
  assert.equal(on.neighbours!.mode, "gemuetlich");
  assert.equal(validateIntent(on, dem, { type: "set_neighbours", mode: "gemuetlich" }, "builder", NOW).ok, false);
  const off = applyIntent(on, { type: "set_neighbours", mode: "off" }, NOW, undefined, dem).state;
  assert.equal(neighbourCut(off, 1), 0);
  const again = applyIntent(off, { type: "set_neighbours", mode: "gemuetlich" }, NOW, undefined, dem).state;
  assert.deepEqual(again.neighbours!.list, on.neighbours!.list);
});
