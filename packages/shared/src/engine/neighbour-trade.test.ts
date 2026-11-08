import assert from "node:assert/strict";
import { test } from "node:test";
import { NEIGHBOURS } from "../../../config/src/economy.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import { IntentSchema, type Intent } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { resortLinks, suggestDescent } from "./descent.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { ensureMatchPlayers, PENDING_READY } from "./match.ts";
import { neighbourEstimate, neighbourReservation } from "./neighbour-trade.ts";
import { absDay, closeNeighbourDay, neighbourCut, neighbourHexes, neighbourOf, pactFee, setNeighbourMode } from "./neighbours.ts";
import { emptyResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const elev = (h: Axial) => {
  const w = hexToWorld(h.q, h.r);
  return dem.sample(w.x, w.z);
};

/** A small resort of the players' own: one lift from the village and a run down. */
function ownResort(coins = 2_000_000): ResortState {
  let s: ResortState = { ...emptyResort(), coins, xp: 999_999 };
  outer: for (const a of hexesInRange(VILLAGE_HEX, 2)) {
    for (const b of hexesInRange(a, 12)) {
      if (hexDistance(a, b) < 8 || elev(b) - elev(a) < 250) continue;
      const it = { type: "place_lift" as const, itemId: "chair" as const, a, b };
      if (validateIntent(s, dem, it, "builder", NOW).ok) {
        s = applyIntent(s, it, NOW, undefined, dem).state;
        const run = suggestDescent(s, dem, s.lifts[0]!.id, "any");
        if (run) s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run }, NOW, undefined, dem).state;
        break outer;
      }
    }
  }
  return s;
}

function game(start: ResortState = { ...emptyResort(), coins: 2_000_000, xp: 999_999 }, mode: "gemuetlich" | "wettbewerb" = "gemuetlich") {
  let s = setNeighbourMode(start, dem, mode, NOW);
  const act = (it: Intent, actorId?: string) => {
    const v = validateIntent(s, dem, it, "builder", NOW, { actorId });
    if (!v.ok) return v;
    const out = applyIntent(s, it, NOW, actorId ? { id: actorId, name: actorId } : undefined, dem);
    s = out.state;
    return { ...v, title: out.title, body: out.body };
  };
  return { get s() { return s; }, set s(v: ResortState) { s = v; }, act };
}

const winter = { day: 10, timeOfDay: 0.5 };

test("the new intents are in the schema, with neighbour ids only", () => {
  assert.ok(IntentSchema.safeParse({ type: "neighbour_pact", neighbourId: "nb1", on: true }).success);
  assert.ok(IntentSchema.safeParse({ type: "offer_buyout", neighbourId: "nb2", amount: 5000 }).success);
  assert.ok(IntentSchema.safeParse({ type: "answer_counter", neighbourId: "nb1", accept: false }).success);
  assert.equal(IntentSchema.safeParse({ type: "offer_buyout", neighbourId: "l_x", amount: 5000 }).success, false);
  assert.equal(IntentSchema.safeParse({ type: "offer_buyout", neighbourId: "nb1", amount: 0 }).success, false);
  assert.ok(IntentSchema.safeParse({ type: "set_neighbours", mode: "wettbewerb" }).success);
});

test("a «Tarifverbund» takes the partner's cut away, adds its draw, and costs a fee every day", () => {
  const g = game({ ...ownResort(), ...winter });
  const n = g.s.neighbours!.list[0]!;
  const before = tickFlow(g.s, dem, 0, PENDING_READY).stats;
  assert.ok(before.neighbourCut! > 0);
  const signed = g.s.coins;
  assert.equal(g.act({ type: "neighbour_pact", neighbourId: n.id, on: true }).ok, true);
  assert.equal(g.s.neighbours!.list[0]!.pact, true);
  // Signing costs nothing yet: the fee comes at the end of each day.
  assert.equal(g.s.coins, signed);
  const after = tickFlow(g.s, dem, 0, PENDING_READY).stats;
  assert.ok(after.neighbourCut! < before.neighbourCut!, "less of a cut");
  const onlyPartner = g.s.neighbours!.list.length === 1;
  if (onlyPartner) assert.equal(after.neighbourCut, 0);
  assert.ok(after.marketPerHour > before.marketPerHour, "more guests want to come");

  const coins = g.s.coins;
  const closed = closeNeighbourDay(g.s, dem, NOW);
  assert.equal(closed.coins, coins - pactFee(n));
  // Off again: no more fee.
  assert.equal(g.act({ type: "neighbour_pact", neighbourId: n.id, on: false }).ok, true);
  assert.equal(closeNeighbourDay(g.s, dem, NOW).coins, g.s.coins);
  // Twice the same is refused.
  assert.equal(g.act({ type: "neighbour_pact", neighbourId: n.id, on: false }).ok, false);
});

test("a «Tarifverbund» ends when the money for the day is not there", () => {
  const g = game({ ...emptyResort(), coins: 100_000 });
  const n = g.s.neighbours!.list[0]!;
  g.act({ type: "neighbour_pact", neighbourId: n.id, on: true });
  const broke = closeNeighbourDay({ ...g.s, coins: pactFee(n) - 1 }, dem, NOW);
  assert.equal(broke.coins, pactFee(n) - 1, "nothing charged");
  assert.equal(broke.neighbours!.list[0]!.pact, false);
});

test("an offer at its price buys at once; below it the neighbour counters", () => {
  const g = game();
  const n = g.s.neighbours!.list[0]!;
  const price = neighbourReservation(g.s, n);
  assert.ok(price > 0 && neighbourEstimate(n) > 0);

  const low = g.act({ type: "offer_buyout", neighbourId: n.id, amount: price - NEIGHBOURS.buyout.priceStep });
  assert.equal(low.ok, true);
  const countered = g.s.neighbours!.list.find((x) => x.id === n.id)!;
  assert.ok(countered.counter, "a counteroffer");
  assert.ok(countered.counter!.price >= price);
  assert.equal(g.s.lifts.length, 0, "nothing bought yet");

  // Far too low: a plain no, no counter.
  const g2 = game();
  g2.act({ type: "offer_buyout", neighbourId: n.id, amount: 1000 });
  assert.equal(g2.s.neighbours!.list[0]!.counter, undefined);

  const coins = g2.s.coins;
  assert.equal(g2.act({ type: "offer_buyout", neighbourId: n.id, amount: price }).ok, true);
  assert.equal(g2.s.coins, coins - price);
  assert.equal(g2.s.neighbours!.list.some((x) => x.id === n.id), false, "gone from the list");
  assert.equal(g2.s.lifts.length, n.lifts.length);
});

test("a struggling neighbour is cheaper than a booming one", () => {
  const g = game();
  const n = g.s.neighbours!.list[0]!;
  const thaw = neighbourReservation({ day: 85 }, { ...n, coins: 0 });
  const boom = neighbourReservation({ day: 10 }, { ...n, coins: NEIGHBOURS.buyout.boomCoins * 2 });
  assert.ok(thaw < neighbourEstimate(n) && neighbourEstimate(n) < boom);
});

test("a counteroffer can be taken, turned down, or run out", () => {
  const g = game();
  const n = g.s.neighbours!.list[0]!;
  const price = neighbourReservation(g.s, n);
  const offer = { type: "offer_buyout" as const, neighbourId: n.id, amount: Math.round(price * 0.8) };
  const counterOf = (st: ResortState = g.s) => st.neighbours!.list[0]!.counter;

  // Declined.
  g.act(offer);
  assert.ok(counterOf());
  assert.equal(g.act({ type: "answer_counter", neighbourId: n.id, accept: false }).ok, true);
  assert.equal(counterOf(), undefined);
  assert.equal(g.act({ type: "answer_counter", neighbourId: n.id, accept: true }).ok, false, "nothing left to answer");

  // Run out: after its days it is gone, and can no longer be taken.
  g.act(offer);
  const until = counterOf()!.until;
  assert.equal(until - absDay(g.s) + 1, NEIGHBOURS.buyout.counterDays);
  const later = { ...g.s, day: g.s.day + NEIGHBOURS.buyout.counterDays };
  assert.equal(validateIntent(later, dem, { type: "answer_counter", neighbourId: n.id, accept: true }, "builder", NOW).ok, false);
  assert.equal(counterOf(closeNeighbourDay(later, dem, NOW)), undefined);

  // Accepted: paid at the counter price.
  const counter = counterOf()!;
  const coins = g.s.coins;
  assert.equal(g.act({ type: "answer_counter", neighbourId: n.id, accept: true }).ok, true);
  assert.equal(g.s.coins, coins - counter.price);
  assert.equal(g.s.neighbours!.list.some((x) => x.id === n.id), false);
});

test("a takeover hands over lifts, stations and runs with new ids, joined in the graph", () => {
  const g = game();
  const n = g.s.neighbours!.list[0]!;
  const hexesBefore = neighbourHexes(g.s).size;
  g.act({ type: "offer_buyout", neighbourId: n.id, amount: neighbourReservation(g.s, n) }, "michael");
  const s = g.s;
  assert.equal(s.lifts.length, n.lifts.length);
  assert.equal(s.pistes.length, n.pistes.length);
  // Its stations, and a car park by the lowest valley station.
  assert.equal(s.buildings.filter((b) => b.itemId !== NEIGHBOURS.buyout.door).length, n.buildings.length);
  assert.equal(s.buildings.filter((b) => b.itemId === NEIGHBOURS.buyout.door).length, 1);
  for (const e of [...s.lifts, ...s.pistes, ...s.buildings]) {
    assert.equal(neighbourOf(e.id), null, `${e.id} is the players' own`);
    assert.equal(e.builtBy, "michael");
    assert.equal(e.readyAt, NOW);
  }
  for (const l of s.lifts) {
    assert.ok(s.buildings.some((b) => b.id === l.stationA));
    assert.ok(s.buildings.some((b) => b.id === l.stationB));
  }
  // The ground is no longer anyone else's.
  assert.ok(neighbourHexes(s).size < hexesBefore);
  const links = resortLinks(s, dem);
  for (const l of s.lifts) assert.equal(links.get(l.id), "ok", `lift ${l.id}`);
  for (const p of s.pistes) assert.equal(links.get(p.id), "ok", `run ${p.id}`);
  // And guests ride them.
  const flowed = tickFlow({ ...s, ...winter }, dem, 0, PENDING_READY);
  assert.ok(flowed.stats.guestsPerHour > 0);
  // Bought, not built: no free «Rückgängig» for the full price.
  assert.equal(validateIntent(s, dem, { type: "undo", entityId: s.lifts[0]!.id }, "builder", NOW, { actorId: "michael" }).ok, false);
  // The bought lifts can be worked on like any other.
  assert.equal(validateIntent(s, dem, { type: "upgrade", entityId: s.lifts[0]!.id, key: "speed" }, "builder", NOW, { actorId: "michael" }).ok, true);
});

test("separate purses: the buyer pays from their own", () => {
  const g = game();
  g.act({ type: "start_match", preset: "normal", options: { economy: "duel" } }, "pA");
  g.s = ensureMatchPlayers(g.s, ["pA", "pB"]);
  g.s = { ...g.s, coins: 1_000_000, match: { ...g.s.match, wallets: { pA: 900_000, pB: 100_000 } } };
  const n = g.s.neighbours!.list[0]!;
  const price = neighbourReservation(g.s, n);
  // pB cannot afford what pA can.
  if (price > 100_000) assert.equal(g.act({ type: "offer_buyout", neighbourId: n.id, amount: price }, "pB").ok, false);
  assert.equal(g.act({ type: "offer_buyout", neighbourId: n.id, amount: price }, "pA").ok, true);
  assert.equal(g.s.match.wallets.pA, 900_000 - price);
  assert.equal(g.s.match.wallets.pB, 100_000);
  assert.ok(g.s.lifts.every((l) => l.builtBy === "pA"));
});

test("trades are refused for unknown neighbours, without the money, with neighbours off, or after a match", () => {
  const g = game({ ...emptyResort(), coins: 5_000 });
  const n = g.s.neighbours!.list[0]!;
  const check = (s: ResortState, it: Intent) => validateIntent(s, dem, it, "builder", NOW);
  assert.equal(check(g.s, { type: "offer_buyout", neighbourId: "nb9", amount: 1000 }).ok, false);
  assert.equal(check(g.s, { type: "neighbour_pact", neighbourId: "nb9", on: true }).ok, false);
  const broke = check(g.s, { type: "offer_buyout", neighbourId: n.id, amount: 6_000 });
  assert.equal(broke.ok ? "" : broke.code, "budget");
  assert.equal(check({ ...g.s, coins: 0 }, { type: "neighbour_pact", neighbourId: n.id, on: true }).ok, false);
  const off = setNeighbourMode(g.s, dem, "off", NOW);
  assert.equal(check({ ...off, coins: 1_000_000 }, { type: "offer_buyout", neighbourId: n.id, amount: 1000 }).ok, false);
  assert.equal(check({ ...off, coins: 1_000_000 }, { type: "neighbour_pact", neighbourId: n.id, on: true }).ok, false);
  // A finished match is to look at, not to trade in.
  const m = game();
  m.act({ type: "start_match", preset: "kurz" });
  const finished = { ...m.s, coins: 1_000_000, match: { ...m.s.match, phase: "finished" as const } };
  assert.equal(check(finished, { type: "offer_buyout", neighbourId: n.id, amount: 1000 }).ok, false);
  // The mode stays for the whole match.
  assert.equal(check(m.s, { type: "set_neighbours", mode: "wettbewerb" }).ok, false);
});

test("«Wettbewerb»: a bigger cut that follows your ticket price, and rivals keep off your ground", () => {
  const own = { ...ownResort(), ...winter };
  const cosy = setNeighbourMode(own, dem, "gemuetlich", NOW);
  const rivals = setNeighbourMode(own, dem, "wettbewerb", NOW);
  assert.deepEqual(rivals.neighbours!.list, setNeighbourMode(own, dem, "gemuetlich", NOW).neighbours!.list);
  const km = 2;
  assert.ok(neighbourCut({ ...rivals, ticketPrice: NEIGHBOURS.wettbewerb.rivalTicket }, km) > neighbourCut(cosy, km));
  const cheap = neighbourCut({ ...rivals, ticketPrice: 45 }, km);
  const dear = neighbourCut({ ...rivals, ticketPrice: 120 }, km);
  assert.ok(dear > cheap, "dearer passes lose more guests");
  assert.ok(dear <= NEIGHBOURS.wettbewerb.cutCeiling);
  // Gemütlich ignores the price.
  assert.equal(neighbourCut({ ...cosy, ticketPrice: 45 }, km), neighbourCut({ ...cosy, ticketPrice: 120 }, km));
  // Their runs never touch the players'.
  const theirs = neighbourHexes(rivals);
  for (const p of own.pistes) for (const h of p.hexes) assert.equal(theirs.has(`${h.q},${h.r}`), false);
  // And they grow faster: a rival builds again sooner than a cosy neighbour.
  let r: ResortState = { ...rivals, day: 5 };
  let c: ResortState = { ...cosy, day: 5 };
  const rivalStart = r.neighbours!.list.reduce((n, x) => n + x.lifts.length, 0);
  const cosyStart = c.neighbours!.list.reduce((n, x) => n + x.lifts.length, 0);
  for (let d = 0; d < 24; d++) {
    r = { ...closeNeighbourDay(r, dem, NOW), day: r.day + 1 };
    c = { ...closeNeighbourDay(c, dem, NOW), day: c.day + 1 };
  }
  const rivalGrew = r.neighbours!.list.reduce((n, x) => n + x.lifts.length, 0) - rivalStart;
  const cosyGrew = c.neighbours!.list.reduce((n, x) => n + x.lifts.length, 0) - cosyStart;
  assert.ok(rivalGrew >= cosyGrew);
  for (const n of r.neighbours!.list) {
    for (const p of n.pistes) for (const h of p.hexes) for (const l of own.lifts) assert.ok(hexDistance(h, l.a) > NEIGHBOURS.clearance);
  }
});

test("a match keeps the chosen mode and starts from fresh neighbours", () => {
  const g = game(undefined, "wettbewerb");
  g.act({ type: "start_match", preset: "normal" });
  assert.equal(g.s.neighbours?.mode, "wettbewerb");
  assert.ok(g.s.neighbours!.list.length > 0);
  assert.ok(g.s.neighbours!.list.every((n) => !n.pact && !n.counter));
});
