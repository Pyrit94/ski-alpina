import assert from "node:assert/strict";
import { test } from "node:test";
import { PISTE_SCORE } from "../../../config/src/economy.ts";
import type { Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { liftEnds } from "./descent.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { routePiste } from "./piste-route.ts";
import { bestReshape, reshapeAll } from "./piste-reshape.ts";
import { scorePiste } from "./piste-score.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;

function withStraightRun(): ResortState {
  let s: ResortState = { ...emptyResort(), coins: 2_000_000 };
  for (let r = 6; r <= 16; r++) {
    const it = { type: "place_lift" as const, itemId: "chair" as const, a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: VILLAGE_HEX.r + r } };
    if (validateIntent(s, dem, it, "builder", NOW).ok) {
      s = applyIntent(s, it, NOW, undefined, dem).state;
      break;
    }
  }
  const { top, base } = liftEnds(dem, s.lifts[0]!);
  const line = routePiste(dem, top, base, "any") as Axial[];
  return applyIntent(s, { type: "place_piste", itemId: "piste", hexes: line }, NOW, undefined, dem).state;
}

test("a straight run can be reshaped into a better one between the same ends", () => {
  const s = withStraightRun();
  const run = s.pistes[0]!;
  const r = bestReshape(s, dem, run.id);
  if (!r) return; // terrain allows nothing better here
  assert.ok(r.after >= r.before + PISTE_SCORE.reshapeMinGain);
  assert.deepEqual(r.hexes[0], run.hexes[0]);
  assert.deepEqual(r.hexes.at(-1), run.hexes.at(-1));
  const intent = { type: "reshape_piste" as const, pisteId: run.id, hexes: r.hexes };
  assert.ok(validateIntent(s, dem, intent, "builder", NOW).ok);
  const after = applyIntent(s, intent, NOW, undefined, dem).state;
  const changed = after.pistes[0]!;
  assert.equal(changed.id, run.id);
  assert.equal(changed.score, scorePiste(r.hexes, dem).points);
  assert.equal(after.coins, s.coins - r.cost);
  assert.ok(reshapeAll(after, dem).every((x) => x.pisteId !== run.id || x.after > changed.score!));
});

test("a reshaping may not move a run's ends", () => {
  const s = withStraightRun();
  const run = s.pistes[0]!;
  const moved = run.hexes.slice(0, -3);
  const v = validateIntent(s, dem, { type: "reshape_piste", pisteId: run.id, hexes: moved }, "builder", NOW);
  assert.equal(v.ok, false);
});
