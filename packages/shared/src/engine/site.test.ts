import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY, SITE } from "../../../config/src/economy.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { RESEARCH_GATE } from "../../../config/src/research.ts";
import { hexDistance, hexesInRange, type Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { siteAt, siteContext, siteImpact } from "./site.ts";
import { emptyResort } from "./state.ts";
import { validateGround, validateIntent } from "./validate.ts";
import { planVillage } from "./village.ts";

const dem = generateDem();
const NOW = 5_000_000;
const LATER = NOW + 10_000_000;
const me = { id: "p1", name: "Michael" };
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });

function build(state: ResortState, itemId: ItemId, hex: Axial): ResortState {
  const intent = { type: "place_building" as const, itemId, q: hex.q, r: hex.r };
  const v = validateIntent(state, dem, intent, "builder", NOW, { actorId: me.id });
  assert.ok(v.ok, `${itemId} at ${hex.q},${hex.r}: ${v.ok ? "" : v.reason}`);
  return applyIntent(state, intent, NOW, me, dem).state;
}

/**
 * The first legal spot for an item that satisfies `want`, nearest the village
 * first. With `groundOnly`, the access rules (road, run) are left out: a
 * restaurant far from everything is exactly what the location factor is
 * about, even if it may no longer be built there.
 */
function spot(state: ResortState, itemId: ItemId, want: (h: Axial) => boolean = () => true, groundOnly = false): Axial {
  for (let radius = 0; radius <= 12; radius++) {
    for (const h of hexesInRange(VILLAGE_HEX, radius)) {
      if (hexDistance(h, VILLAGE_HEX) !== radius || !want(h)) continue;
      const ok = groundOnly
        ? validateGround(dem, h.q, h.r, itemId).ok && !state.buildings.some((b) => b.q === h.q && b.r === h.r)
        : validateIntent(state, dem, { type: "place_building", itemId, q: h.q, r: h.r }, "builder", NOW, { actorId: me.id }).ok;
      if (ok) return h;
    }
  }
  throw new Error(`no spot for ${itemId}`);
}

/** Place without the rules, for a spot `spot(…, true)` found. */
function buildAnyway(state: ResortState, itemId: ItemId, hex: Axial): ResortState {
  return applyIntent(state, { type: "place_building", itemId, q: hex.q, r: hex.r }, NOW, me, dem).state;
}

/** A chairlift up from the village with a run back down its line. */
function withRun(): ResortState {
  let s: ResortState = {
    ...emptyResort(),
    coins: 2_000_000,
    xp: 999_999,
    // Everything researched: these tests are about places, not unlocking.
    research: { ...emptyResort().research, done: [...new Set(Object.values(RESEARCH_GATE))] as string[] },
  };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(VILLAGE_HEX.r + 8) }, NOW, me, dem).state;
  const hexes: Axial[] = [];
  for (let r = VILLAGE_HEX.r + 8; r >= VILLAGE_HEX.r + 1; r--) hexes.push(col(r));
  return applyIntent(s, { type: "place_piste", itemId: "piste", hexes }, NOW, me, dem).state;
}

test("a restaurant on the run does better than one far from it", () => {
  const s = withRun();
  const ctx = siteContext(s, dem);
  const run = s.pistes[0]!.hexes;
  const onRun = spot(s, "restaurant", (h) => run.some((r) => hexDistance(r, h) === 1));
  const remote = spot(s, "restaurant", (h) => run.every((r) => hexDistance(r, h) > SITE.foodFar) && hexDistance(h, VILLAGE_HEX) > SITE.foodFar, true);
  const good = siteAt(ctx, "restaurant", onRun);
  const poor = siteAt(ctx, "restaurant", remote);
  assert.ok(good.factor > 1, `on the run: ${good.factor}`);
  assert.ok(poor.factor < 1, `remote: ${poor.factor}`);
  assert.ok(good.effects.length > 0 && poor.effects.length > 0);
  // Mild by design.
  assert.ok(good.factor <= SITE.max && poor.factor >= SITE.min);
});

test("the location scales what a restaurant serves", () => {
  const s = withRun();
  const run = s.pistes[0]!.hexes;
  const onRun = spot(s, "restaurant", (h) => run.some((r) => hexDistance(r, h) === 1));
  const remote = spot(s, "restaurant", (h) => run.every((r) => hexDistance(r, h) > SITE.foodFar) && hexDistance(h, VILLAGE_HEX) > SITE.foodFar, true);
  const seats = (state: ResortState) => {
    const id = state.buildings.at(-1)!.id;
    return tickFlow(state, dem, 0, LATER).flow.find((e) => e.id === id)!.capacity;
  };
  assert.ok(seats(build(s, "restaurant", onRun)) > seats(buildAnyway(s, "restaurant", remote)));
});

test("a car park next to a hotel costs the hotel a little, and the preview says so", () => {
  let s = withRun();
  const hotel = spot(s, "hotel1");
  s = build(s, "hotel1", hotel);
  const ctx = siteContext(s, dem);
  const before = siteAt(ctx, "hotel1", hotel, s.buildings.at(-1)!.id).factor;
  const next = spot(s, "parking", (h) => hexDistance(h, hotel) === 1);
  const impact = siteImpact(ctx, "parking", next);
  assert.equal(impact.length, 1);
  assert.equal(impact[0]!.itemId, "hotel1");
  assert.ok(Math.abs(impact[0]!.after - (before + SITE.noise)) < 1e-6);
  const after = build(s, "parking", next);
  const hotelId = s.buildings.at(-1)!.id;
  assert.ok(siteAt(siteContext(after, dem), "hotel1", hotel, hotelId).factor < before);
});

test("the optimiser moves a hotel away from the noise, and the move can be applied", () => {
  let s = withRun();
  const hotel = spot(s, "hotel1");
  s = build(s, "hotel1", hotel);
  for (const item of ["workshop", "groomer"] as ItemId[]) s = build(s, item, spot(s, item, (h) => hexDistance(h, hotel) === 1));
  const plan = planVillage(s, dem);
  assert.ok(plan.moves.length > 0);
  assert.ok(plan.after > plan.before, `${plan.before} → ${plan.after}`);
  assert.ok(plan.moves.length <= SITE.maxMoves);
  // Car parks, buses and lift stations never move.
  assert.ok(plan.moves.every((m) => !["parking", "bus", "chair"].includes(m.itemId)));
  assert.equal(plan.cost, plan.moves.reduce((n, m) => n + Math.round(BY_ID[m.itemId].cost * ECONOMY.moveCostShare), 0));

  const intent = { type: "rearrange" as const, moves: plan.moves.map((m) => ({ entityId: m.id, q: m.to.q, r: m.to.r })) };
  const v = validateIntent(s, dem, intent, "builder", NOW, { actorId: me.id });
  assert.ok(v.ok, v.ok ? "" : v.reason);
  const done = applyIntent(s, intent, NOW, me, dem).state;
  assert.equal(done.coins, s.coins - plan.cost);
  for (const m of plan.moves) {
    const b = done.buildings.find((x) => x.id === m.id)!;
    assert.deepEqual({ q: b.q, r: b.r }, m.to);
  }
  // Planning again on the result finds little or nothing left to do.
  assert.ok(planVillage(done, dem).after >= plan.after - 1e-9);
});

test("a rearrangement may not stack buildings or move lift stations", () => {
  let s = withRun();
  const a = spot(s, "restaurant");
  s = build(s, "restaurant", a);
  const b = spot(s, "shop");
  s = build(s, "shop", b);
  const [rest, shop] = [s.buildings.at(-2)!, s.buildings.at(-1)!];
  const ok = (moves: { entityId: string; q: number; r: number }[]) =>
    validateIntent(s, dem, { type: "rearrange", moves }, "builder", NOW, { actorId: me.id }).ok;
  // A swap is fine…
  assert.equal(ok([{ entityId: rest.id, q: b.q, r: b.r }, { entityId: shop.id, q: a.q, r: a.r }]), true);
  // …one onto the other is not.
  assert.equal(ok([{ entityId: rest.id, q: b.q, r: b.r }]), false);
  // Nor is moving a station.
  const station = s.buildings.find((x) => x.itemId === "chair")!;
  assert.equal(ok([{ entityId: station.id, q: a.q + 1, r: a.r }]), false);
});
