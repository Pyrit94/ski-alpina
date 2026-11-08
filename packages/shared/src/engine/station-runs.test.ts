import assert from "node:assert/strict";
import { test } from "node:test";
import { FLOW } from "../../../config/src/economy.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { liftEnds, resortLinks } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { midStationSpots } from "./mid-station.ts";
import { missingLegs, planStationRuns } from "./station-runs.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const elev = (h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z);
};

function longLift(): ResortState {
  const s: ResortState = { ...emptyResort(), coins: 5_000_000, xp: 999_999 };
  for (const a of hexesInRange(VILLAGE_HEX, 2)) {
    for (const b of hexesInRange(a, 16)) {
      if (hexDistance(a, b) < 12 || elev(b) - elev(a) < 300) continue;
      const it = { type: "place_lift" as const, itemId: "chair" as const, a, b };
      if (validateIntent(s, dem, it, "builder", NOW).ok) return applyIntent(s, it, NOW, undefined, dem).state;
    }
  }
  return s;
}

test("a fresh lift lacks all three legs", () => {
  const s = longLift();
  const lift = s.lifts[0];
  assert.ok(lift, "a long lift on this ground");
  assert.deepEqual(missingLegs(s, dem, lift.id), ["top-mid", "mid-base", "top-base"]);
});

test("the chosen legs come with the middle station, each joined where it should be", () => {
  let s = longLift();
  const lift = s.lifts[0]!;
  const spots = midStationSpots(s, dem, lift.id);
  assert.ok(spots.length > 0, "room for a middle station");
  const mid = spots[Math.floor(spots.length / 2)]!;
  const { top } = liftEnds(dem, lift);

  const plan = planStationRuns(s, dem, lift.id, mid, ["top-mid", "mid-base"], { mix: "mixed", budget: 3_000_000 });
  assert.deepEqual(plan.runs.map((r) => r.leg), ["top-mid", "mid-base"]);
  const [upper, lower] = plan.runs as [(typeof plan.runs)[0], (typeof plan.runs)[0]];
  assert.ok(hexDistance(upper.hexes[0]!, top) <= FLOW.linkRadius);
  assert.ok(hexDistance(upper.hexes.at(-1)!, mid) <= 1);
  assert.ok(hexDistance(lower.hexes[0]!, mid) === 0);
  assert.equal(plan.cost, upper.cost + lower.cost);

  // Built in order, as the panel sends them: every one valid, every one joined.
  const intents = [
    { type: "add_mid_station" as const, liftId: lift.id, q: mid.q, r: mid.r },
    ...plan.runs.map((r) => ({ type: "place_piste" as const, itemId: "piste" as const, hexes: r.hexes })),
  ];
  for (const it of intents) {
    assert.ok(validateIntent(s, dem, it, "builder", NOW).ok, it.type);
    s = applyIntent(s, it, NOW, undefined, dem).state;
  }
  const links = resortLinks(s, dem);
  for (const p of s.pistes) assert.equal(links.get(p.id), "ok");
  assert.equal(links.get(lift.id), "ok");
});

test("a leg asked for alone is planned alone, in the grade asked for when the ground has one", () => {
  const s = longLift();
  const lift = s.lifts[0]!;
  const mid = midStationSpots(s, dem, lift.id)[0]!;
  const only = planStationRuns(s, dem, lift.id, mid, ["top-base"], { mix: "mixed", budget: 3_000_000 });
  assert.ok(only.runs.every((r) => r.leg === "top-base"));
  const mixed = planStationRuns(s, dem, lift.id, mid, ["mid-base"], { mix: "mixed", budget: 3_000_000 });
  const asked = mixed.runs[0]?.grade;
  if (asked === "blue" || asked === "red" || asked === "black") {
    const same = planStationRuns(s, dem, lift.id, mid, ["mid-base"], { mix: asked, budget: 3_000_000 });
    assert.equal(same.runs[0]?.grade, asked);
  }
});

test("no money, no runs: the legs are reported as too dear", () => {
  const s = longLift();
  const lift = s.lifts[0]!;
  const mid = midStationSpots(s, dem, lift.id)[0]!;
  const poor = planStationRuns(s, dem, lift.id, mid, ["top-mid", "mid-base"], { mix: "mixed", budget: 0 });
  assert.equal(poor.runs.length, 0);
  assert.ok(poor.missed.every((m) => m.reason === "budget" || m.reason === "terrain"));
  assert.ok(poor.missed.some((m) => m.reason === "budget"));
});
