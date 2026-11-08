import assert from "node:assert/strict";
import { test } from "node:test";
import { TEAMPLAY } from "../../../packages/config/src/economy.ts";
import { hexesInRange } from "../../../packages/shared/src/hex.ts";
import { VILLAGE_HEX } from "../../../packages/shared/src/engine/graph.ts";
import { emptyResort } from "../../../packages/shared/src/engine/state.ts";
import { neighbourReservation } from "../../../packages/shared/src/engine/neighbour-trade.ts";
import { setNeighbourMode } from "../../../packages/shared/src/engine/neighbours.ts";
import { validateIntent } from "../../../packages/shared/src/engine/validate.ts";
import { generateDem } from "../../../packages/shared/src/terrain/dem.ts";
import type { ActivityEntry, ResortState } from "../../../packages/shared/src/types.ts";
import { markOf, summarize } from "./away.ts";
import { planTitle, proposalFor } from "./proposals.ts";

const dem = generateDem();
const me = { id: "p1", name: "Michael" };
const partner = { "p2": { name: "Johanna", builds: 3, demolished: 0, coinsSpent: 1000 } };

function spot(state: ResortState, itemId: "restaurant" | "parking") {
  for (const h of hexesInRange(VILLAGE_HEX, 5)) {
    const it = { type: "place_building" as const, itemId, q: h.q, r: h.r };
    if (validateIntent(state, dem, it, "builder", Date.now(), { actorId: me.id }).ok) return it;
  }
  throw new Error("no spot");
}

test("alone, everything is built straight away", () => {
  const s: ResortState = { ...emptyResort(), coins: 500_000, proposalLimit: 1000 };
  assert.equal(proposalFor(s, dem, [spot(s, "restaurant")], me), null);
});

test("with a partner, a step above the limit becomes a proposal, below it does not", () => {
  const s: ResortState = { ...emptyResort(), coins: 500_000, contributors: partner };
  const cheap = spot(s, "parking");
  assert.equal(proposalFor({ ...s, proposalLimit: 50_000 }, dem, [cheap], me), null);
  const asked = proposalFor({ ...s, proposalLimit: 1000 }, dem, [cheap], me);
  assert.equal(asked?.type, "propose");
  assert.match(asked!.title, /Parkhaus bauen/);
  // Off means never.
  assert.equal(proposalFor({ ...s, proposalLimit: 0 }, dem, [cheap], me), null);
  // Not for things that build nothing.
  assert.equal(proposalFor({ ...s, proposalLimit: 1 }, dem, [{ type: "set_ticket_price", chf: 80 }], me), null);
});

test("coming back after a while lists what the others did and what waits", () => {
  const base: ResortState = { ...emptyResort(), coins: 100_000 };
  const mark = markOf(base, 1_000_000);
  const later = 1_000_000 + (TEAMPLAY.awayMinutes + 50) * 60_000;
  const entry = (actor: string, at: number): ActivityEntry => ({ id: `a${at}`, at, actor, actorName: actor === "p2" ? "Johanna" : "Michael", title: "Gondelbahn gebaut", body: "", kind: "ok" });
  const now: ResortState = {
    ...base,
    coins: 112_000,
    stats: { ...base.stats, visitorsTotal: 1500 },
    activity: [entry("p2", later - 1000), entry("p1", later - 2000), entry("p2", 500_000)],
    proposals: [{ id: "pr1", by: "p2", byName: "Johanna", at: later - 500, title: "Hotel bauen", intents: [], cost: 28000 }],
  };
  const sum = summarize(mark, now, "p1", later)!;
  assert.equal(sum.coins, 12_000);
  assert.equal(sum.visitors, 1500);
  // Only the partner's, only since the mark.
  assert.equal(sum.news.length, 1);
  assert.equal(sum.proposals.length, 1);
  // A short break shows nothing.
  assert.equal(summarize(mark, now, "p1", 1_000_000 + 60_000), null);
});

test("a proposal's title says what it does", () => {
  const r = { type: "place_building" as const, itemId: "restaurant" as const, q: 0, r: 0 };
  assert.equal(planTitle([r]), "Restaurant bauen");
  assert.equal(planTitle([r, { ...r, q: 2 }]), "2× Restaurant bauen");
  assert.equal(planTitle([{ type: "rearrange", moves: [{ entityId: "b1", q: 0, r: 0 }] }]), "Dorf neu ordnen (1 Gebäude)");
});

test("buying a neighbour above the limit asks the partner; a counteroffer alone does not", () => {
  const s: ResortState = setNeighbourMode(
    { ...emptyResort(), coins: 2_000_000, contributors: partner, proposalLimit: 50_000 },
    dem,
    "gemuetlich",
    1,
  );
  const n = s.neighbours!.list[0]!;
  const price = neighbourReservation(s, n);
  assert.ok(price > 50_000);
  const offer = { type: "offer_buyout" as const, neighbourId: n.id, amount: price };
  const buy = proposalFor(s, dem, [offer], me);
  assert.equal(buy?.type, "propose");
  assert.equal(buy!.title, "Nachbargebiet kaufen");
  // Below its price it only counters: nothing spent, nothing to ask.
  assert.equal(proposalFor(s, dem, [{ ...offer, amount: Math.round(price * 0.8) }], me), null);
  // A «Tarifverbund» costs by the day, not at once: no proposal.
  assert.equal(proposalFor(s, dem, [{ type: "neighbour_pact", neighbourId: n.id, on: true }], me), null);
});
