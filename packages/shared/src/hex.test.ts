import assert from "node:assert/strict";
import { test } from "node:test";
import { HEX_DIRS, hexDistance, hexToWorld, hexesInRange, worldToHex } from "./hex.ts";

test("hexesInRange radius 0 is the center", () => {
  const cells = hexesInRange({ q: 2, r: -1 }, 0);
  assert.equal(cells.length, 1);
  assert.equal(cells[0]?.q, 2);
  assert.equal(cells[0]?.r, -1);
});

test("hexesInRange radius 2 has 19 cells", () => {
  const cells = hexesInRange({ q: 0, r: 9 }, 2);
  assert.equal(cells.length, 1 + 3 * 2 * 3);
});

test("worldToHex roundtrips axial neighbors", () => {
  for (const d of HEX_DIRS) {
    const w = hexToWorld(d.q, d.r);
    const back = worldToHex(w.x, w.z);
    assert.equal(back.q + 0, d.q + 0);
    assert.equal(back.r + 0, d.r + 0);
    assert.equal(hexDistance({ q: 0, r: 0 }, d), 1);
  }
});
