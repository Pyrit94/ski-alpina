import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCESS } from "../../../config/src/economy.ts";
import { RESEARCH_GATE } from "../../../config/src/research.ts";
import { hexDistance, hexesInRange, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort } from "./state.ts";
import { validateGround, validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const base = (): ResortState => ({
  ...emptyResort(),
  coins: 2_000_000,
  xp: 999_999,
  research: { ...emptyResort().research, done: [...new Set(Object.values(RESEARCH_GATE))] as string[] },
});
const place = (s: ResortState, itemId: "hotel1" | "hut" | "restaurant", h: Axial) =>
  validateIntent(s, dem, { type: "place_building", itemId, q: h.q, r: h.r }, "builder", NOW);

/** Buildable ground for a hotel, outside the village streets, with a road possible beside it. */
function outside(): { hotel: Axial; road: Axial[] } {
  for (const h of hexesInRange(VILLAGE_HEX, ACCESS.villageStreets + 4)) {
    const d = hexDistance(h, VILLAGE_HEX);
    if (d <= ACCESS.villageStreets + 1 || !validateGround(dem, h.q, h.r, "hotel1").ok) continue;
    // A two-hex road ending beside it, both hexes fit for a road.
    for (const n of hexesInRange(h, 1)) {
      if (hexDistance(n, h) !== 1) continue;
      for (const m of hexesInRange(n, 1)) {
        if (hexDistance(m, n) !== 1 || hexDistance(m, h) < 2) continue;
        if (validateGround(dem, n.q, n.r, "road").ok && validateGround(dem, m.q, m.r, "road").ok) return { hotel: h, road: [m, n] };
      }
    }
  }
  throw new Error("no spot");
}

test("a hotel stands in the village or on a road, not in the open", () => {
  const s = base();
  const { hotel, road } = outside();
  const v = place(s, "hotel1", hotel);
  assert.equal(v.ok, false);
  assert.match(v.ok ? "" : v.reason, /Strasse/);
  const withRoad = applyIntent(s, { type: "place_piste", itemId: "road", hexes: road }, NOW).state;
  assert.equal(place(withRoad, "hotel1", hotel).ok, true);
});

test("a hut stands beside a run or a station; a restaurant may stand either way", () => {
  const s = base();
  const village = hexesInRange(VILLAGE_HEX, 2).find((h) => validateGround(dem, h.q, h.r, "restaurant").ok && (h.q !== VILLAGE_HEX.q || h.r !== VILLAGE_HEX.r))!;
  assert.equal(place(s, "restaurant", village).ok, true);
  const hutSpot = hexesInRange(VILLAGE_HEX, 12).find((h) => validateGround(dem, h.q, h.r, "hut").ok)!;
  const v = place(s, "hut", hutSpot);
  assert.equal(v.ok, false);
  assert.match(v.ok ? "" : v.reason, /Piste/);
});
