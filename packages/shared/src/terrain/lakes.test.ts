import assert from "node:assert/strict";
import { test } from "node:test";
import { REGION_BY_ID } from "../../../config/src/regions.ts";
import { worldToHex } from "../hex.ts";
import { getDem, loadRegion, regionPoint } from "./dem.ts";
import { validateGround } from "../engine/validate.ts";

const cells = (w: Uint8Array) => w.reduce((n, v) => n + v, 0);

test("named lakes are flooded from the ground's own level, at about their real size", async () => {
  await loadRegion("st-moritz");
  await loadRegion("davos");
  await loadRegion("zermatt");
  // About 110 m a cell: the three Engadin lakes are ~4 km², the Davosersee ~0.6 km².
  assert.ok(cells(getDem("st-moritz").water) > 250 && cells(getDem("st-moritz").water) < 420);
  assert.ok(cells(getDem("davos").water) > 30 && cells(getDem("davos").water) < 70);
  // No lake named, none drawn — a flat valley floor stays land.
  assert.equal(cells(getDem("zermatt").water), 0);
});

test("nothing is built on a lake", async () => {
  await loadRegion("st-moritz");
  const dem = getDem("st-moritz");
  const def = REGION_BY_ID["st-moritz"]!;
  const lake = def.lakes!.map((l) => regionPoint(def, l.lat, l.lon)).find((p) => dem.isWater(p.x, p.z))!;
  assert.ok(lake);
  const h = worldToHex(lake.x, lake.z);
  const res = validateGround(dem, h.q, h.r, "restaurant");
  assert.equal(res.ok, false);
});
