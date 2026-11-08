import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCESS, TERRAFORM } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { RESEARCH_GATE } from "../../../config/src/research.ts";
import { hexDistance, hexesInRange, hexToWorld } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const base = (): ResortState => ({
  ...emptyResort(),
  coins: 2_000_000,
  xp: 999_999,
  research: { ...emptyResort().research, done: [...new Set(Object.values(RESEARCH_GATE))] as string[] },
});

/** A hex in the village streets too steep for a hotel, but not for levelling. */
function steepVillageHex() {
  for (const h of hexesInRange(VILLAGE_HEX, ACCESS.villageStreets)) {
    if (hexDistance(h, VILLAGE_HEX) === 0) continue;
    const { x, z } = hexToWorld(h.q, h.r);
    const s = dem.slope(x, z);
    if (s > BY_ID.hotel1.maxSlope && s <= TERRAFORM.maxSlope && !dem.isWater(x, z)) return h;
  }
  return null;
}

test("levelling a hex of valley floor makes it buildable", () => {
  const h = steepVillageHex();
  if (!h) return; // this map has no such slope by the village
  let s = base();
  const hotel = { type: "place_building" as const, itemId: "hotel1" as const, q: h.q, r: h.r };
  const before = validateIntent(s, dem, hotel, "builder", NOW);
  assert.equal(before.ok, false);
  const level = { type: "level_ground" as const, q: h.q, r: h.r };
  assert.ok(validateIntent(s, dem, level, "builder", NOW).ok);
  const coins = s.coins;
  s = applyIntent(s, level, NOW, undefined, dem).state;
  assert.equal(s.coins, coins - TERRAFORM.costPerHex);
  assert.ok(s.terrain?.[`${h.q},${h.r}`] !== undefined);
  assert.ok(validateIntent(s, dem, hotel, "builder", NOW).ok);
  // Once is enough.
  assert.equal(validateIntent(s, dem, level, "builder", NOW).ok, false);
});

test("only the valley floor can be levelled", () => {
  const s = base();
  const v = hexToWorld(VILLAGE_HEX.q, VILLAGE_HEX.r);
  const high = hexesInRange(VILLAGE_HEX, 30).find((h) => {
    const { x, z } = hexToWorld(h.q, h.r);
    if (Math.abs(x) > 90 || Math.abs(z) > 90) return false;
    return dem.sample(x, z) - dem.sample(v.x, v.z) > TERRAFORM.maxAboveVillageM + 50 && dem.slope(x, z) < TERRAFORM.maxSlope;
  })!;
  const r = validateIntent(s, dem, { type: "level_ground", q: high.q, r: high.r }, "builder", NOW);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.reason, /Talgrund/);
});
