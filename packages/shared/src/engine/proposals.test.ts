import assert from "node:assert/strict";
import { test } from "node:test";
import { BY_ID } from "../../../config/src/items.ts";
import type { Axial } from "../hex.ts";
import { hexesInRange } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { proposalLimit } from "./proposals.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 5_000_000;
const me = { id: "p1", name: "Michael" };
const you = { id: "p2", name: "Johanna" };

function act(state: ResortState, intent: Intent, actor = me) {
  const v = validateIntent(state, dem, intent, "builder", NOW, { actorId: actor.id });
  if (!v.ok) return { state, ok: false as const, reason: v.reason };
  return { state: applyIntent(state, intent, NOW, actor, dem).state, ok: true as const };
}

function restaurantSpot(state: ResortState): Axial {
  for (const h of hexesInRange(VILLAGE_HEX, 5)) {
    if (validateIntent(state, dem, { type: "place_building", itemId: "restaurant", q: h.q, r: h.r }, "builder", NOW, { actorId: me.id }).ok) return h;
  }
  throw new Error("no spot");
}

const base = (): ResortState => ({ ...emptyResort(), coins: 200_000 });

test("a proposal builds nothing until the other player accepts, then it is the proposer's", () => {
  const s = base();
  const h = restaurantSpot(s);
  const build = { type: "place_building" as const, itemId: "restaurant" as const, q: h.q, r: h.r };
  const proposed = act(s, { type: "propose", title: "Restaurant beim Dorf", intents: [build] });
  assert.ok(proposed.ok);
  assert.equal(proposed.state.buildings.length, 0);
  assert.equal(proposed.state.coins, s.coins);
  const p = proposed.state.proposals![0]!;
  assert.equal(p.byName, "Michael");
  assert.equal(p.cost, BY_ID.restaurant.cost);

  // Not by the proposer.
  assert.equal(act(proposed.state, { type: "decide_proposal", proposalId: p.id, accept: true }).ok, false);
  const done = act(proposed.state, { type: "decide_proposal", proposalId: p.id, accept: true }, you);
  assert.ok(done.ok);
  assert.equal(done.state.buildings.length, 1);
  assert.equal(done.state.buildings[0]!.builtBy, me.id);
  assert.equal(done.state.coins, s.coins - BY_ID.restaurant.cost);
  assert.equal(done.state.proposals!.length, 0);
  // Spending is credited once, to the proposer.
  assert.equal(done.state.contributors[me.id]!.coinsSpent, BY_ID.restaurant.cost);
  assert.equal(done.state.contributors[you.id]?.coinsSpent ?? 0, 0);
});

test("a proposal can be withdrawn or declined", () => {
  const s = base();
  const h = restaurantSpot(s);
  const intents = [{ type: "place_building", itemId: "restaurant", q: h.q, r: h.r }];
  const proposed = act(s, { type: "propose", title: "Restaurant", intents });
  const id = proposed.state.proposals![0]!.id;
  const withdrawn = act(proposed.state, { type: "decide_proposal", proposalId: id, accept: false });
  assert.ok(withdrawn.ok);
  assert.equal(withdrawn.state.proposals!.length, 0);
  assert.equal(withdrawn.state.buildings.length, 0);
  const declined = act(proposed.state, { type: "decide_proposal", proposalId: id, accept: false }, you);
  assert.equal(declined.state.proposals!.length, 0);
});

test("a proposal must be possible when made, may not nest, and is re-checked when accepted", () => {
  const s = base();
  assert.equal(act(s, { type: "propose", title: "Nichts", intents: [{ type: "place_building", itemId: "restaurant", q: 999, r: 0 }] }).ok, false);
  assert.equal(act(s, { type: "propose", title: "Doppelt", intents: [{ type: "propose", title: "x", intents: [] }] }).ok, false);
  const h = restaurantSpot(s);
  const proposed = act(s, { type: "propose", title: "Restaurant", intents: [{ type: "place_building", itemId: "restaurant", q: h.q, r: h.r }] });
  const broke = { ...proposed.state, coins: 10 };
  const late = act(broke, { type: "decide_proposal", proposalId: proposed.state.proposals![0]!.id, accept: true }, you);
  assert.ok(late.ok);
  assert.equal(late.state.buildings.length, 0);
  assert.equal(late.state.proposals!.length, 0);
});

test("the limit can be changed and defaults from the config", () => {
  const s = base();
  assert.ok(proposalLimit(s) > 0);
  const off = act(s, { type: "set_proposal_limit", limit: 0 });
  assert.equal(proposalLimit(off.state), 0);
});
