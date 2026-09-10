import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTerrainRgbSample, encodeTerrainRgb, generateDem } from "./dem.ts";
import { PEAKS, TERRAIN, VILLAGE } from "../../../config/src/terrain.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexToWorld, hexesInRange, worldToHex } from "../hex.ts";

test("DEM sample at Matterhorn is near 4478 m", () => {
  const dem = generateDem();
  const m = PEAKS[0];
  const h = dem.sample(m.x, m.z);
  assert.ok(h > 3800, `expected alpine peak, got ${h}`);
});

test("village is a buildable valley", () => {
  const dem = generateDem();
  const h = dem.sample(-4, 40);
  assert.ok(h > 1550 && h < 1850, `village elev ${h}`);
  assert.equal(dem.isWater(-4, 40), false);
  // Elevation alone is not buildability: the slope gate is what actually
  // decides, and a valley floor has to pass the strictest item there is.
  const flattest = Math.min(...Object.values(BY_ID).map((i) => i.maxSlope));
  const slope = dem.slope(-4, 40);
  assert.ok(slope <= flattest, `village slope ${slope} exceeds ${flattest}`);
});

test("slope is a real gradient, not a world-unit artefact", () => {
  const dem = generateDem();
  // Rise over run in metres, measured the long way round from raw samples.
  const step = 4;
  const rise = Math.abs(dem.sample(-4 + step, 40) - dem.sample(-4 - step, 40));
  const run = 2 * step * TERRAIN.metresPerWorldUnit;
  assert.ok(rise / run < 1, "a valley floor cannot exceed 45 degrees");
  // A world unit is ground distance, not a metre: ~92 m for this window.
  assert.ok(TERRAIN.metresPerWorldUnit > 60 && TERRAIN.metresPerWorldUnit < 140);
});

test("the valley around the village can take the starter buildings", () => {
  // The graph now pays only for what connects to the village, so if nothing
  // can be placed near it the game is unwinnable rather than merely hard.
  const dem = generateDem();
  const village = worldToHex(VILLAGE.x, VILLAGE.z);
  const fits = (id: "tbar" | "restaurant" | "parking" | "piste") => {
    const item = BY_ID[id];
    return hexesInRange(village, 4).filter((hex) => {
      const { x, z } = hexToWorld(hex.q, hex.r);
      const elev = dem.sample(x, z);
      return (
        !dem.isWater(x, z) &&
        elev >= item.minElev &&
        elev <= item.maxElev &&
        dem.slope(x, z) <= item.maxSlope
      );
    }).length;
  };
  for (const id of ["tbar", "restaurant", "parking", "piste"] as const) {
    assert.ok(fits(id) >= 5, `only ${fits(id)} hexes near the village take ${id}`);
  }
});

test("terrain-rgb roundtrip", () => {
  const meters = 4478;
  const encoded = Math.round((meters + 10000) * 10);
  const r = (encoded >> 16) & 255;
  const g = (encoded >> 8) & 255;
  const b = encoded & 255;
  const back = decodeTerrainRgbSample(r, g, b);
  assert.ok(Math.abs(back - meters) < 0.2);
  const dem = generateDem();
  const rgba = encodeTerrainRgb(dem);
  assert.equal(rgba.length, dem.n * dem.n * 4);
});
