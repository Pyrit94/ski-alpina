import assert from "node:assert/strict";
import { test } from "node:test";
import { PISTE_SCORE } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexToWorld, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { countSwings, relaxLine, scorePiste, starsFor } from "./piste-score.ts";
import { emptyResort } from "./state.ts";

const dem = generateDem();
const pts = (list: [number, number][]) => list.map(([x, z]) => ({ x, z }));

test("a straight line has no swings, a bend one, an S two", () => {
  assert.equal(countSwings(pts([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]])), 0);
  assert.equal(countSwings(pts([[0, 0], [0, 2], [0, 4], [1, 5.5], [3, 6.5], [5, 7]])), 1);
  const s = pts([[0, 0], [1, 2], [3, 3.5], [5, 4], [7, 5], [8, 7], [8, 9], [7, 11], [5, 12.5], [3, 13]]);
  assert.ok(countSwings(s) >= 2);
});

test("the hex zigzag of a straight run does not count as swinging", () => {
  // Alternating hex directions down a column: one straight line on the map.
  const hexes: Axial[] = [];
  for (let i = 0; i < 12; i++) hexes.push({ q: VILLAGE_HEX.q - Math.floor(i / 2), r: VILLAGE_HEX.r + i });
  const line = relaxLine(hexes.map((h) => hexToWorld(h.q, h.r)));
  assert.equal(countSwings(line), 0);
});

test("points add up from their parts, and stars follow the points", () => {
  const hexes: Axial[] = [];
  for (let r = 0; r < 14; r++) hexes.push({ q: VILLAGE_HEX.q, r: VILLAGE_HEX.r + 14 - r });
  const sc = scorePiste(hexes, dem);
  assert.equal(sc.points, sc.parts.drop + sc.parts.length + sc.parts.turns + sc.parts.variety);
  assert.ok(sc.points >= 0 && sc.points <= 100);
  assert.equal(sc.stars, starsFor(sc.points));
  assert.equal(starsFor(0), 1);
  assert.equal(starsFor(100), 5);
});

test("a run keeps its rating and earns XP for it", () => {
  let s: ResortState = { ...emptyResort(), coins: 500_000 };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: VILLAGE_HEX.r + 9 } }, 1000, undefined, dem).state;
  const hexes: Axial[] = [];
  for (let r = 9; r >= 1; r--) hexes.push({ q: VILLAGE_HEX.q, r: VILLAGE_HEX.r + r });
  const before = s.xp;
  const after = applyIntent(s, { type: "place_piste", itemId: "piste", hexes }, 1000, undefined, dem).state;
  const run = after.pistes[0]!;
  const sc = scorePiste(hexes, dem);
  assert.equal(run.score, sc.points);
  assert.equal(after.xp - before, BY_ID.piste.xp * (hexes.length - 1) + Math.round(sc.points * PISTE_SCORE.xpPerPoint));
});
