import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS, VILLAGE_GAME_ELEV } from "../../../config/src/regions.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexToWorld, hexesInRange } from "../hex.ts";
import { validateGround } from "../engine/validate.ts";
import { getDem, loadAllRegions, loadRegion, regionPoint, setActiveRegion } from "./dem.ts";

test("every region loads real ground, with its village at the game's valley height", async () => {
  await loadAllRegions();
  for (const def of REGIONS) {
    const dem = getDem(def.id);
    assert.equal(dem.region.id, def.id);
    const v = dem.region.village;
    // Normalised: the village sits at the shared gameplay height.
    assert.ok(Math.abs(dem.sample(v.x, v.z) - VILLAGE_GAME_ELEV) < 2, `${def.id} village`);
    // Real relief: well over a thousand metres between valley and summits.
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of dem.elev) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    assert.ok(hi - lo > 1200, `${def.id} relief ${hi - lo}`);
    // The village lies inside the play window.
    assert.ok(Math.abs(v.x) < dem.world / 2 - 8 && Math.abs(v.z) < dem.world / 2 - 8, `${def.id} village in window`);
    // Labelled summits are above the village and report real heights.
    for (const p of dem.region.peaks) assert.ok(p.elev > VILLAGE_GAME_ELEV - dem.region.offset, `${def.id} ${p.name}`);
    assert.ok(dem.region.far && dem.region.far.world > dem.world);
  }
});

test("there is room to build next to every village", async () => {
  await loadAllRegions();
  for (const def of REGIONS) {
    const dem = getDem(def.id);
    const around = hexesInRange(dem.region.villageHex, 6);
    const lift = around.filter((h) => validateGround(dem, h.q, h.r, "chair").ok).length;
    const piste = around.filter((h) => validateGround(dem, h.q, h.r, "piste").ok).length;
    assert.ok(lift >= 10, `${def.id}: ${lift} hexes for a lift station`);
    assert.ok(piste >= 20, `${def.id}: ${piste} hexes for a run`);
  }
  void BY_ID;
  void hexToWorld;
});

test("north is up and east is right: Zermatt's Matterhorn lies south-west of the village", async () => {
  const dem = await loadRegion("zermatt");
  const matterhorn = dem.region.peaks.find((p) => p.name === "Matterhorn")!;
  const village = dem.region.village;
  assert.ok(matterhorn.z > village.z, "south is +z");
  assert.ok(matterhorn.x < village.x, "west is −x");
  // The grid is ~110 m: a needle like the Matterhorn loses its last few hundred metres.
  assert.ok(matterhorn.elev > 4100, `Matterhorn ${matterhorn.elev} m`);
  const def = REGIONS.find((r) => r.id === "zermatt")!;
  const at = regionPoint(def, def.center.lat, def.center.lon);
  assert.ok(Math.abs(at.x) < 1e-9 && Math.abs(at.z) < 1e-9);
});

test("the active region is what getDem answers without an id", async () => {
  await loadRegion("davos");
  setActiveRegion("davos");
  assert.equal(getDem().region.id, "davos");
  setActiveRegion("classic");
  assert.equal(getDem().region.id, "classic");
});
