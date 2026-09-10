import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeTerrainRgbSample, encodeTerrainRgb, generateDem } from "./dem.ts";
import { PEAKS } from "../../../config/src/terrain.ts";

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
