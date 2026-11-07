import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY, FLOW } from "../../../config/src/economy.ts";
import { PISTE_WIDTHS } from "../../../config/src/terrain.ts";
import type { Axial, PlacedPiste, ResortState } from "../index.ts";
import { hexDistance, hexToWorld } from "../hex.ts";
import { MAX_PISTE_HEXES } from "../protocol/intents.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { pisteCapacity, pisteUpkeep } from "./level.ts";
import { extendDraft, pisteLinks, snapPisteStart } from "./piste-draft.ts";
import { pistePriceAt, widthChangePrice } from "./piste-edit.ts";
import { routePiste, segmentGrades } from "./piste-route.ts";
import { emptyResort, migrateResort } from "./state.ts";
import { pisteCost, surveyPiste, validateIntent, validatePistePath } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};
const slopeAt = (hex: Axial) => {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.slope(x, z);
};
const elevAt = (hex: Axial) => {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
};

function rich(): ResortState {
  return { ...emptyResort(), xp: 999_999, coins: 9_000_000, timeOfDay: 0.5 };
}

function piste(width?: 1 | 2 | 3, difficulty: PlacedPiste["difficulty"] = "blue"): PlacedPiste {
  return { id: "p1", itemId: "piste", difficulty, hexes: run(1, 9), builtAt: 0, readyAt: 0, ...(width ? { width } : {}) };
}

// ── Widths ────────────────────────────────────────────────────────────────

test("widths: normal is exactly the old behaviour", () => {
  const normal = PISTE_WIDTHS.find((w) => w.width === 2)!;
  for (const key of ["capacity", "cost", "upkeep", "draw", "beginnerDraw"] as const) {
    assert.equal(normal[key], 1, `normal width changes ${key}`);
  }
  // A run saved before widths existed is a normal one.
  assert.equal(pisteCapacity(piste()), pisteCapacity(piste(2)));
  assert.equal(pisteUpkeep(piste()), pisteUpkeep(piste(2)));
  assert.equal(surveyPiste(dem, "piste", run(1, 9))!.cost, surveyPiste(dem, "piste", run(1, 9), 2)!.cost);
  const migrated = migrateResort({ pistes: [piste()] });
  assert.equal(migrated.pistes[0]!.width, undefined);
});

test("widths: wider carries more, costs more and grooms dearer", () => {
  assert.ok(pisteCapacity(piste(1)) < pisteCapacity(piste(2)));
  assert.ok(pisteCapacity(piste(2)) < pisteCapacity(piste(3)));
  assert.ok(pisteUpkeep(piste(1)) < pisteUpkeep(piste(2)));
  assert.ok(pisteUpkeep(piste(2)) < pisteUpkeep(piste(3)));
  const cost = (w: 1 | 2 | 3) => pisteCost(dem, "piste", run(1, 9), w);
  assert.ok(cost(1) < cost(2));
  assert.ok(cost(2) < cost(3));
  const breit = PISTE_WIDTHS.find((w) => w.width === 3)!;
  assert.equal(pisteCapacity(piste(3)), Math.round(pisteCapacity(piste(2)) * breit.capacity));
});

test("widths: the width chosen is charged and stored", () => {
  const hexes = run(1, 9);
  const before = rich();
  const after = applyIntent(
    before,
    { type: "place_piste", itemId: "piste", hexes, width: 3, name: "  Dorfabfahrt " },
    NOW,
    undefined,
    dem,
  ).state;
  assert.equal(before.coins - after.coins, pisteCost(dem, "piste", hexes, 3));
  assert.equal(after.pistes[0]!.width, 3);
  assert.equal(after.pistes[0]!.name, "Dorfabfahrt");
  // Without a choice nothing is stored: old and new default runs look the same.
  const plain = applyIntent(before, { type: "place_piste", itemId: "piste", hexes }, NOW, undefined, dem).state;
  assert.equal("width" in plain.pistes[0]!, false);
  assert.equal("name" in plain.pistes[0]!, false);
});

test("widths: an unaffordable wide run is refused for the money", () => {
  const hexes = run(1, 9);
  const coins = pisteCost(dem, "piste", hexes, 2);
  const state = { ...rich(), coins };
  assert.equal(validateIntent(state, dem, { type: "place_piste", itemId: "piste", hexes }, "builder", NOW).ok, true);
  const wide = validateIntent(state, dem, { type: "place_piste", itemId: "piste", hexes, width: 3 }, "builder", NOW);
  assert.equal(wide.ok, false);
  if (!wide.ok) assert.equal(wide.code, "budget");
});

/** A lift up the valley and one run back down, at a given width. */
function circuit(width?: 1 | 2 | 3): ResortState {
  let state = rich();
  state = applyIntent(state, { type: "place_lift", itemId: "chair", a: col(9), b: col(1) }, BUILT, undefined, dem).state;
  state = applyIntent(state, { type: "place_piste", itemId: "piste", hexes: run(1, 9), width }, BUILT, undefined, dem).state;
  return state;
}

test("widths: the flow graph carries a wide run's extra capacity", () => {
  const edge = (w?: 1 | 2 | 3) => tickFlow(circuit(w), dem, 1 / 60, NOW).flow.find((e) => e.kind === "piste")!;
  assert.ok(edge(3).capacity > edge(2).capacity);
  assert.ok(edge(1).capacity < edge(2).capacity);
});

test("widths: a wide blue run draws more guests, a narrow one fewer", () => {
  const market = (w?: 1 | 2 | 3) => tickFlow(circuit(w), dem, 1 / 60, NOW).stats.marketPerHour;
  assert.equal(market(undefined), market(2));
  assert.ok(market(3) > market(2));
  assert.ok(market(1) < market(2));
});

test("widths: daily upkeep follows the width", () => {
  const upkeep = (w?: 1 | 2 | 3) => tickFlow(circuit(w), dem, 1 / 60, NOW).stats.upkeepPerHour;
  assert.ok(upkeep(3) > upkeep(2));
  assert.ok(upkeep(1) < upkeep(2));
});

// ── edit_piste ────────────────────────────────────────────────────────────

function built(width?: 1 | 2 | 3): ResortState {
  return applyIntent(rich(), { type: "place_piste", itemId: "piste", hexes: run(1, 9), width }, BUILT, undefined, dem).state;
}

test("edit_piste: renaming is free", () => {
  const state = built();
  const id = state.pistes[0]!.id;
  const intent = { type: "edit_piste" as const, pisteId: id, name: "Matterhorn-Abfahrt" };
  assert.equal(validateIntent(state, dem, intent, "builder", NOW).ok, true);
  const next = applyIntent(state, intent, NOW, undefined, dem).state;
  assert.equal(next.coins, state.coins);
  assert.equal(next.pistes[0]!.name, "Matterhorn-Abfahrt");
  // An empty name clears it again.
  const cleared = applyIntent(next, { type: "edit_piste", pisteId: id, name: "" }, NOW, undefined, dem).state;
  assert.equal(cleared.pistes[0]!.name, undefined);
});

test("edit_piste: widening pays the price difference", () => {
  const state = built();
  const p = state.pistes[0]!;
  const diff = pistePriceAt(p, 3, dem) - pistePriceAt(p, 2, dem);
  assert.ok(diff > 0);
  assert.equal(widthChangePrice(p, 3, dem), diff);
  const next = applyIntent(state, { type: "edit_piste", pisteId: p.id, width: 3 }, NOW, undefined, dem).state;
  assert.equal(state.coins - next.coins, diff);
  assert.equal(next.pistes[0]!.width, 3);
  // Built wide from the start would have cost the same in total.
  assert.equal(pistePriceAt(p, 2, dem) + diff, pisteCost(dem, "piste", p.hexes, 3));
});

test("edit_piste: narrowing refunds only the demolition share", () => {
  const state = built(3);
  const p = state.pistes[0]!;
  const saved = pistePriceAt(p, 3, dem) - pistePriceAt(p, 1, dem);
  const next = applyIntent(state, { type: "edit_piste", pisteId: p.id, width: 1 }, NOW, undefined, dem).state;
  assert.equal(next.coins - state.coins, Math.floor(saved * ECONOMY.demolishRefund));
  assert.equal(next.pistes[0]!.width, 1);
});

test("edit_piste: refused when unaffordable, unchanged, missing or not a piste", () => {
  const state = built();
  const id = state.pistes[0]!.id;
  const poor = validateIntent({ ...state, coins: 0 }, dem, { type: "edit_piste", pisteId: id, width: 3 }, "builder", NOW);
  assert.equal(poor.ok, false);
  if (!poor.ok) assert.equal(poor.code, "budget");
  // Narrowing pays out, so it needs no money.
  assert.equal(validateIntent({ ...state, coins: 0 }, dem, { type: "edit_piste", pisteId: id, width: 1 }, "builder", NOW).ok, true);
  assert.equal(validateIntent(state, dem, { type: "edit_piste", pisteId: id, width: 2 }, "builder", NOW).ok, false);
  assert.equal(validateIntent(state, dem, { type: "edit_piste", pisteId: id }, "builder", NOW).ok, false);
  assert.equal(validateIntent(state, dem, { type: "edit_piste", pisteId: "nope", name: "X" }, "builder", NOW).ok, false);
  assert.equal(validateIntent(state, dem, { type: "edit_piste", pisteId: id, name: "X" }, "visitor", NOW).ok, false);
  const road = applyIntent(rich(), { type: "place_piste", itemId: "road", hexes: run(7, 9) }, BUILT, undefined, dem).state;
  const widenRoad = validateIntent(road, dem, { type: "edit_piste", pisteId: road.pistes[0]!.id, width: 3 }, "builder", NOW);
  assert.equal(widenRoad.ok, false);
});

// ── Auto-route ────────────────────────────────────────────────────────────

/** Deterministic pairs over the playable valley, start above end. */
function pairs(n: number): [Axial, Axial][] {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const out: [Axial, Axial][] = [];
  while (out.length < n) {
    const s = { q: Math.round(rnd() * 24 - 12), r: Math.round(rnd() * 26 - 20) };
    const e = { q: s.q + Math.round(rnd() * 12 - 6), r: s.r + 3 + Math.round(rnd() * 22) };
    out.push([s, e]);
  }
  return out;
}

test("routePiste: every route it returns is one the server accepts", () => {
  const state = emptyResort();
  let found = 0;
  for (const [s, e] of pairs(400)) {
    for (const target of ["blue", "red", "black", "any"] as const) {
      const path = routePiste(dem, s, e, target);
      if (!path) continue;
      found++;
      assert.deepEqual(path[0], s);
      assert.deepEqual(path[path.length - 1], e);
      assert.ok(path.length <= MAX_PISTE_HEXES);
      const v = validatePistePath(state, dem, "piste", path);
      assert.equal(v.ok, true, `route ${JSON.stringify(s)}→${JSON.stringify(e)} (${target}) invalid: ${v.ok ? "" : v.reason}`);
      assert.ok(surveyPiste(dem, "piste", path));
    }
  }
  assert.ok(found > 100, `only ${found} routes found`);
});

test("routePiste: fast enough to run on a tap", () => {
  const list = pairs(150);
  routePiste(dem, list[0]![0], list[0]![1], "blue");
  const t0 = performance.now();
  let worst = 0;
  for (const [s, e] of list) {
    const t = performance.now();
    routePiste(dem, s, e, "blue");
    worst = Math.max(worst, performance.now() - t);
  }
  const avg = (performance.now() - t0) / list.length;
  assert.ok(avg < 20, `average ${avg.toFixed(2)} ms`);
  assert.ok(worst < 120, `worst ${worst.toFixed(2)} ms`);
});

test("routePiste: the target grade steers the line", () => {
  const s = { q: -5, r: -9 };
  const e = { q: 0, r: -5 };
  const blue = routePiste(dem, s, e, "blue")!;
  const black = routePiste(dem, s, e, "black")!;
  assert.ok(blue && black);
  const steep = (p: Axial[]) => segmentGrades(p, slopeAt).filter((g) => g === "black").length;
  assert.ok(steep(blue) < steep(black), `blue ${steep(blue)} vs black ${steep(black)}`);
  assert.notEqual(surveyPiste(dem, "piste", blue)!.grade, "black");
});

test("routePiste: no route uphill, too far, or through what it must avoid", () => {
  assert.equal(routePiste(dem, col(9), col(1), "any"), null);
  assert.equal(routePiste(dem, col(1), col(1), "any"), null);
  assert.equal(routePiste(dem, { q: VILLAGE_HEX.q, r: -40 }, { q: VILLAGE_HEX.q, r: 12 }, "any"), null);
  const direct = routePiste(dem, col(1), col(9), "any")!;
  assert.ok(direct);
  const avoid = new Set([`${col(5).q},${col(5).r}`]);
  const around = routePiste(dem, col(1), col(9), "any", { avoid })!;
  assert.ok(around);
  assert.equal(around.some((h) => avoid.has(`${h.q},${h.r}`)), false);
  assert.equal(validatePistePath(emptyResort(), dem, "piste", around).ok, true);
});

// ── Drawing ───────────────────────────────────────────────────────────────

const check = (path: readonly Axial[]) => validatePistePath(emptyResort(), dem, "piste", path);

test("drag: a stroke adds the hexes along the pointer's line", () => {
  const step = extendDraft([col(1)], col(5), 1, check);
  assert.deepEqual(step.draft, run(1, 5));
  assert.equal(step.added, 4);
  assert.equal(step.blocked, null);
  // Every step is one hex: what the server requires.
  for (let i = 1; i < step.draft.length; i++) assert.equal(hexDistance(step.draft[i - 1]!, step.draft[i]!), 1);
});

test("drag: the line stops at the first hex that would break the run", () => {
  // Dragging up the valley: a little rolling is allowed, a climb is not.
  const up = extendDraft([col(9)], col(-5), 1, check);
  assert.equal(up.blocked?.code, "slope");
  assert.ok(up.draft.length < run(-5, 9).length);
  // What was kept is valid, and the next hex is the one that broke it.
  if (up.draft.length >= 2) assert.equal(check(up.draft).ok, true);
  const last = up.draft[up.draft.length - 1]!;
  const next = { q: last.q, r: last.r - 1 };
  assert.ok(elevAt(next) > elevAt(last) + FLOW.pisteRiseTolerance);
});

test("drag: moving back over the stroke takes it back, but not past its start", () => {
  const drawn = extendDraft(run(1, 3), col(7), 3, check).draft;
  assert.deepEqual(drawn, run(1, 7));
  const back = extendDraft(drawn, col(5), 3, check);
  assert.deepEqual(back.draft, run(1, 5));
  assert.equal(back.added, -2);
  // Hexes from an earlier stroke stay.
  assert.deepEqual(extendDraft(back.draft, col(2), 3, check).draft, run(1, 5));
});

test("drag: never longer than the server allows", () => {
  let draft: Axial[] = [col(-30)];
  draft = extendDraft(draft, col(40), 1, check).draft;
  assert.ok(draft.length <= MAX_PISTE_HEXES);
});

// ── Connections ───────────────────────────────────────────────────────────

test("links: a run from a lift top to the village is joined at both ends", () => {
  let state = rich();
  state = applyIntent(state, { type: "place_lift", itemId: "chair", a: col(9), b: col(1) }, BUILT, undefined, dem).state;
  const links = pisteLinks(state, dem, run(1, 9));
  assert.equal(links.start?.kind, "lift-top");
  assert.ok(links.end && (links.end.kind === "lift-base" || links.end.kind === "village"));
  // Starting next to the top station snaps onto it.
  const snap = snapPisteStart(state, dem, { q: col(1).q + 1, r: col(1).r });
  assert.deepEqual(snap?.hex, col(1));
  // Out of the link radius nothing snaps and nothing is joined.
  const far = { q: col(1).q + FLOW.linkRadius + 2, r: col(1).r };
  assert.equal(snapPisteStart(state, dem, far), null);
  const loose = pisteLinks(emptyResort(), dem, run(-6, -2));
  assert.equal(loose.start, null);
  assert.equal(loose.end, null);
});
