import assert from "node:assert/strict";
import { test } from "node:test";
import { BY_ID } from "../../../config/src/items.ts";
import { hexToWorld, hexesInRange } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { liftReach, reachLeft } from "./research.ts";
import { emptyResort } from "./state.ts";
import { validateHex } from "./validate.ts";

const dem = generateDem();

/** A hex a cog station could stand on but for its height: between 2'250 and 2'750 m. */
function highSpot() {
  for (const h of hexesInRange(VILLAGE_HEX, 30)) {
    const w = hexToWorld(h.q, h.r);
    const e = dem.sample(w.x, w.z);
    if (e < 2250 || e > 2750 || dem.slope(w.x, w.z) > BY_ID.cog.maxSlope) continue;
    return h;
  }
  throw new Error("no spot");
}

const withDone = (done: string[]): ResortState => ({ ...emptyResort(), research: { ...emptyResort().research, done } });

test("a cog railway starts at 2'200 m and climbs higher with research", () => {
  const h = highSpot();
  const before = validateHex(withDone(["zahnrad"]), dem, h.q, h.r, "cog");
  assert.equal(before.ok, false);
  assert.match(before.ok ? "" : before.reason, /bis 2.200 m – Forschung/);
  assert.equal(liftReach(withDone(["zahnrad", "zahnrad2"]), "cog"), 600);
  assert.equal(validateHex(withDone(["zahnrad", "zahnrad2"]), dem, h.q, h.r, "cog").ok, true);
  assert.equal(reachLeft(withDone(["zahnrad", "zahnrad2", "zahnrad3"]), "cog"), false);
});

test("cableways gain height in two steps, and only research raises them", () => {
  assert.equal(liftReach(withDone([]), "gondola"), 0);
  assert.equal(liftReach(withDone(["hochalpin"]), "gondola"), 400);
  assert.equal(liftReach(withDone(["hochalpin", "hochalpin2"]), "gondola"), 800);
  assert.equal(liftReach(withDone(["hochalpin", "hochalpin2"]), "tbar"), 0);
});
